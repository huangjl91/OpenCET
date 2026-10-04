package com.cet.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cet.common.BizException;
import com.cet.common.TranslationGrader;
import com.cet.dto.NearMissVo;
import com.cet.dto.ScoreBreakdown;
import com.cet.dto.TranslationResultVo;
import com.cet.dto.TranslationReviewRequest;
import com.cet.dto.TranslationSubmitRequest;
import com.cet.entity.ErrorBook;
import com.cet.entity.TranslationAttempt;
import com.cet.entity.TranslationQuestion;
import com.cet.mapper.ErrorBookMapper;
import com.cet.mapper.TranslationAttemptMapper;
import com.cet.mapper.TranslationQuestionMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 翻译练习服务
 *
 * <p>批改链路分两级：
 * <ol>
 *   <li><b>机器分（本地启发式）</b>：{@link TranslationGrader} 给出核心词覆盖、篇幅贴合、语言规范三项得分；</li>
 *   <li><b>语义分（LLM 二次润色评分）</b>：由前端用浏览器直连模型服务商（API Key 不出本机）算出，
 *       再经 {@link #review} 回填持久化，并按<b>综合分</b>重新判定错题本。</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TranslationService {

    private final TranslationQuestionMapper questionMapper;
    private final TranslationAttemptMapper attemptMapper;
    private final ErrorBookMapper errorBookMapper;

    /** 低于该分数自动进入错题本 */
    private static final int WRONG_SCORE = 70;

    /* -------------------------------------------------- 题目 -------------------------------------------------- */

    public List<TranslationQuestion> list(String level, String type, Integer difficulty) {
        List<TranslationQuestion> all = questionMapper.selectList(null);
        return all.stream()
                .filter(q -> !StringUtils.hasText(level) || level.equals(q.getLevel()))
                .filter(q -> !StringUtils.hasText(type) || type.equals(q.getType()))
                .filter(q -> difficulty == null || difficulty.equals(q.getDifficulty()))
                .sorted(Comparator.comparing(TranslationQuestion::getLevel)
                        .thenComparing(TranslationQuestion::getDifficulty)
                        .thenComparing(TranslationQuestion::getId))
                .toList();
    }

    public TranslationQuestion get(String id) {
        TranslationQuestion q = questionMapper.selectById(id);
        if (q == null) {
            throw new BizException("题目不存在：" + id);
        }
        return q;
    }

    /* -------------------------------------------------- 批改 -------------------------------------------------- */

    /**
     * 提交译文并批改（机器分）
     */
    @Transactional
    public TranslationResultVo submit(Long userId, TranslationSubmitRequest req) {
        TranslationQuestion q = get(req.getQuestionId());
        String answer = req.getAnswer() == null ? "" : req.getAnswer().trim();

        TranslationGrader.Result g = TranslationGrader.grade(answer, q.getReference(), q.getCoreWords());
        int score = g.score();
        boolean wrong = score < WRONG_SCORE;

        TranslationAttempt attempt = new TranslationAttempt();
        attempt.setUserId(userId);
        attempt.setQuestionId(q.getId());
        attempt.setAnswer(answer);
        attempt.setScore(score);
        attempt.setHitWords(g.hit());
        attempt.setMissWords(g.miss());
        attempt.setIsWrong(wrong);
        attempt.setCreateTime(LocalDateTime.now());
        attemptMapper.insert(attempt);

        if (wrong) {
            upsertErrorBook(userId, q, answer, score, g.miss(), null, null);
        }

        TranslationResultVo vo = new TranslationResultVo();
        vo.setQuestionId(q.getId());
        vo.setScore(score);
        vo.setAnswer(answer);
        vo.setQuestion(q);
        vo.setHitWords(g.hit());
        vo.setReorderWords(g.reorder());
        vo.setNearWords(g.near().stream()
                .map(n -> new NearMissVo(n.expected(), n.found(), n.distance()))
                .toList());
        vo.setMissWords(g.miss());
        vo.setWrong(wrong);
        vo.setAttemptId(attempt.getId());
        vo.setBreakdown(buildBreakdown(g));
        vo.setComment(comment(g));
        return vo;
    }

    /**
     * 回填 LLM 二次润色评分结果，并按综合分重新判定错题本
     */
    @Transactional
    public TranslationResultVo review(Long userId, TranslationReviewRequest req) {
        TranslationQuestion q = get(req.getQuestionId());

        TranslationAttempt latest = latestAttempt(userId, q.getId(), req.getAnswer());
        if (latest == null) {
            throw new BizException("未找到对应的作答记录，请先提交译文");
        }

        Integer llmScore = req.getLlmScore() == null ? null : clamp(req.getLlmScore());
        Integer finalScore = req.getFinalScore() == null
                ? (llmScore == null ? latest.getScore() : blend(latest.getScore(), llmScore))
                : clamp(req.getFinalScore());

        latest.setLlmScore(llmScore);
        latest.setFinalScore(finalScore);
        latest.setLlmComment(truncate(req.getLlmComment(), 2000));
        latest.setPolish(truncate(req.getPolish(), 4000));
        latest.setLlmIssues(req.getLlmIssues());
        attemptMapper.updateById(latest);

        boolean wrong = finalScore < WRONG_SCORE;
        latest.setIsWrong(wrong);
        attemptMapper.updateById(latest);

        if (wrong) {
            upsertErrorBook(userId, q, latest.getAnswer(), finalScore, latest.getMissWords(),
                    req.getLlmComment(), req.getPolish());
        } else {
            // 语义复核后达标：把该题从错题本移除（若存在）
            ErrorBook eb = errorBookMapper.selectOne(new LambdaQueryWrapper<ErrorBook>()
                    .eq(ErrorBook::getUserId, userId)
                    .eq(ErrorBook::getSourceType, "TRANSLATION")
                    .eq(ErrorBook::getSourceId, q.getId()));
            if (eb != null) {
                errorBookMapper.deleteById(eb.getId());
            }
        }

        TranslationResultVo vo = new TranslationResultVo();
        vo.setQuestionId(q.getId());
        vo.setScore(latest.getScore());
        vo.setAnswer(latest.getAnswer());
        vo.setQuestion(q);
        vo.setHitWords(latest.getHitWords());
        vo.setMissWords(latest.getMissWords());
        vo.setWrong(wrong);
        vo.setAttemptId(latest.getId());
        vo.setLlmScore(llmScore);
        vo.setFinalScore(finalScore);
        vo.setLlmComment(req.getLlmComment());
        vo.setPolish(req.getPolish());
        vo.setLlmIssues(req.getLlmIssues());
        vo.setComment(comment(TranslationGrader.grade(latest.getAnswer(), q.getReference(), q.getCoreWords())));
        return vo;
    }

    /* -------------------------------------------------- 记录 -------------------------------------------------- */

    public List<TranslationAttempt> attempts(Long userId, String level, int limit) {
        return attemptMapper.selectByLevel(userId, level, limit);
    }

    public List<TranslationAttempt> attemptsOfQuestion(Long userId, String questionId) {
        return attemptMapper.selectByQuestion(userId, questionId, 20);
    }

    /**
     * 错题本：按题目去重，只保留「最新一次作答」仍判错的题。
     *
     * <p>不能直接把所有 is_wrong 的作答记录摊出来 —— 同一题答错三次就会出现三行，而且
     * LLM 二次润色复核把最新一次改判为达标后，旧记录仍挂着 is_wrong，界面上看不出「已移出错题本」。
     * 取每题最新一次，才和 {@link #review} 维护的错题本语义一致。
     */
    public List<TranslationAttempt> wrongs(Long userId, String level) {
        Map<String, TranslationAttempt> latestPerQuestion = new LinkedHashMap<>();
        for (TranslationAttempt a : attempts(userId, level, 500)) {
            latestPerQuestion.putIfAbsent(a.getQuestionId(), a); // 已按 create_time 倒序
        }
        return latestPerQuestion.values().stream()
                .filter(a -> Boolean.TRUE.equals(a.getIsWrong()))
                .toList();
    }

    /* -------------------------------------------------- 内部方法 -------------------------------------------------- */

    private ScoreBreakdown buildBreakdown(TranslationGrader.Result g) {
        ScoreBreakdown bd = new ScoreBreakdown();
        bd.setCoreScore(g.coreScore());
        bd.setLengthScore(g.lengthScore());
        bd.setLanguageScore(g.languageScore());
        bd.setCoreRate(g.coreRate());
        bd.setLengthFit(g.lengthFit());
        bd.setRedundancy(g.redundancy());
        bd.setLanguageIssues(g.languageIssues());
        bd.setSpellingIssues(g.spellingIssues());
        bd.setRepeatedWords(g.repeatedWords());
        return bd;
    }

    private TranslationAttempt latestAttempt(Long userId, String questionId, String answer) {
        List<TranslationAttempt> list = attemptMapper.selectByQuestion(userId, questionId, 10);
        if (list == null || list.isEmpty()) {
            return null;
        }
        if (StringUtils.hasText(answer)) {
            for (TranslationAttempt a : list) {
                if (answer.trim().equals(a.getAnswer() == null ? "" : a.getAnswer().trim())) {
                    return a;
                }
            }
        }
        return list.get(0);
    }

    /** 综合分：机器分 40% + 语义分 60%（语义更能反映真实水平） */
    private int blend(int machine, int llm) {
        return clamp((int) Math.round(machine * 0.4 + llm * 0.6));
    }

    private int clamp(int v) {
        return Math.max(0, Math.min(100, v));
    }

    /**
     * 错题本写入（幂等 upsert）
     *
     * @param llmComment LLM 点评，非空时并入笔记
     * @param polish     LLM 润色译文，非空时作为「参考答案」的补充
     */
    private void upsertErrorBook(Long userId, TranslationQuestion q, String answer, int score,
                                 List<String> miss, String llmComment, String polish) {
        ErrorBook existing = errorBookMapper.selectOne(new LambdaQueryWrapper<ErrorBook>()
                .eq(ErrorBook::getUserId, userId)
                .eq(ErrorBook::getSourceType, "TRANSLATION")
                .eq(ErrorBook::getSourceId, q.getId()));

        ErrorBook eb = existing == null ? new ErrorBook() : existing;
        eb.setUserId(userId);
        eb.setSourceType("TRANSLATION");
        eb.setSourceId(q.getId());
        eb.setTitle(truncate(q.getPrompt(), 60));
        eb.setContent(q.getPrompt());
        eb.setUserAnswer(answer);
        eb.setRightAnswer(StringUtils.hasText(polish)
                ? q.getReference() + "\n\n【AI 润色】" + polish
                : q.getReference());
        StringBuilder note = new StringBuilder("得分 ").append(score);
        if (miss != null && !miss.isEmpty()) {
            note.append("；未命中核心词：").append(String.join("、", miss));
        }
        if (StringUtils.hasText(llmComment)) {
            note.append("；AI 点评：").append(truncate(llmComment, 300));
        }
        eb.setNote(note.toString());
        eb.setResolved(false);
        eb.setUpdateTime(LocalDateTime.now());
        if (existing == null) {
            eb.setCreateTime(LocalDateTime.now());
            errorBookMapper.insert(eb);
        } else {
            errorBookMapper.updateById(eb);
        }
    }

    /** 机器点评：分数档位 + 命中统计 + 具体扣分点 */
    private String comment(TranslationGrader.Result g) {
        StringBuilder sb = new StringBuilder();
        int score = g.score();
        if (score >= 90) {
            sb.append("译文质量很高，核心表达基本到位。");
        } else if (score >= 70) {
            sb.append("整体不错，主要失分在细节表达。");
        } else if (score >= 50) {
            sb.append("基本意思传达到了，但漏译、生硬处较多。");
        } else {
            sb.append("与参考译文差距较大，建议先背熟核心词再重译。");
        }

        int total = g.hit().size() + g.reorder().size() + g.near().size() + g.miss().size();
        sb.append(" 核心词得分 ").append(g.coreScore()).append('/').append(TranslationGrader.W_CORE)
                .append("（命中 ").append(g.hit().size()).append('/').append(total).append('）');
        sb.append("，篇幅得分 ").append(g.lengthScore()).append('/').append(TranslationGrader.W_LENGTH);
        sb.append("，语言规范 ").append(g.languageScore()).append('/').append(TranslationGrader.W_LANGUAGE).append('。');

        List<String> extra = new ArrayList<>();
        if (!g.miss().isEmpty()) {
            extra.add("未命中：" + String.join("、", g.miss()));
        }
        if (!g.reorder().isEmpty()) {
            extra.add("词都在但语序存疑：" + String.join("、", g.reorder()));
        }
        if (!g.near().isEmpty()) {
            extra.add("拼写近似：" + g.near().stream()
                    .map(n -> n.found() + "→" + n.expected()).reduce((a, b) -> a + "、" + b).orElse(""));
        }
        if (!extra.isEmpty()) {
            sb.append(' ').append(String.join("；", extra)).append('。');
        }
        if (!g.languageIssues().isEmpty()) {
            sb.append(" 规范提示：").append(String.join("、", g.languageIssues())).append('。');
        }
        return sb.toString();
    }

    private String truncate(String s, int max) {
        if (s == null) {
            return null;
        }
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }
}
