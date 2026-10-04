package com.cet.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cet.common.BizException;
import com.cet.dto.PaperCreateRequest;
import com.cet.dto.PaperDetailVo;
import com.cet.dto.QuestionUpdateRequest;
import com.cet.entity.ErrorBook;
import com.cet.entity.Paper;
import com.cet.entity.PaperQuestion;
import com.cet.entity.PaperSection;
import com.cet.mapper.ErrorBookMapper;
import com.cet.mapper.PaperMapper;
import com.cet.mapper.PaperQuestionMapper;
import com.cet.mapper.PaperSectionMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * 真题拆解服务：结构化落库、单题作答、收藏 / 完成状态、进度统计、示范卷克隆
 *
 * <p>说明：整套真题的「自动切分」由前端 paperParser 完成（规则 + 正则，跨模块标题识别 + 题号切分），
 * 服务端接收切分后的结构化结果，专注数据持久化与个人进度维护，避免前后端两套解析逻辑不一致。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PaperService {

    private final PaperMapper paperMapper;
    private final PaperSectionMapper sectionMapper;
    private final PaperQuestionMapper questionMapper;
    private final ErrorBookMapper errorBookMapper;

    /* -------------------------------------------------- 查询 -------------------------------------------------- */

    public List<Paper> list(Long userId) {
        return paperMapper.selectList(new LambdaQueryWrapper<Paper>()
                .eq(Paper::getUserId, userId)
                .orderByDesc(Paper::getCreateTime));
    }

    public List<Paper> presets() {
        return paperMapper.selectPresets();
    }

    public PaperDetailVo detail(Long paperId) {
        Paper paper = paperMapper.selectById(paperId);
        if (paper == null) {
            throw new BizException("试卷不存在：" + paperId);
        }
        PaperDetailVo vo = new PaperDetailVo();
        copyPaper(paper, vo);

        List<PaperSection> sections = sectionMapper.selectList(
                new LambdaQueryWrapper<PaperSection>()
                        .eq(PaperSection::getPaperId, paperId)
                        .orderByAsc(PaperSection::getOrderNo));

        List<PaperDetailVo.SectionVo> sectionVos = new ArrayList<>();
        for (PaperSection s : sections) {
            PaperDetailVo.SectionVo sv = new PaperDetailVo.SectionVo();
            sv.setId(s.getId());
            sv.setType(s.getSectionType());
            sv.setTitle(s.getTitle());
            sv.setPassage(s.getPassage());
            sv.setOrderNo(s.getOrderNo());
            sv.setQuestions(questionMapper.selectList(new LambdaQueryWrapper<PaperQuestion>()
                    .eq(PaperQuestion::getSectionId, s.getId())
                    .orderByAsc(PaperQuestion::getOrderNo)));
            sectionVos.add(sv);
        }
        vo.setSectionList(sectionVos);
        return vo;
    }

    /* -------------------------------------------------- 创建 / 克隆 / 删除 -------------------------------------------------- */

    @Transactional
    public Long create(Long userId, PaperCreateRequest req) {
        Paper paper = new Paper();
        paper.setUserId(userId);
        paper.setTitle(req.getTitle());
        paper.setLevel(req.getLevel() == null ? "CET4" : req.getLevel());
        paper.setYearMonth(req.getYearMonth());
        paper.setSource(req.getSource() == null ? "粘贴/上传" : req.getSource());
        paper.setRawText(req.getRawText());
        paper.setTotalCount(0);
        paper.setDoneCount(0);
        paper.setCreateTime(LocalDateTime.now());
        paper.setUpdateTime(LocalDateTime.now());
        paperMapper.insert(paper);

        int total = 0;
        int order = 1;
        if (req.getSections() != null) {
            for (PaperCreateRequest.SectionInput si : req.getSections()) {
                PaperSection section = new PaperSection();
                section.setPaperId(paper.getId());
                section.setSectionType(si.getType() == null ? "reading" : si.getType());
                section.setTitle(si.getTitle());
                section.setPassage(si.getPassage());
                section.setOrderNo(order++);
                section.setCreateTime(LocalDateTime.now());
                section.setUpdateTime(LocalDateTime.now());
                sectionMapper.insert(section);

                if (si.getQuestions() == null) {
                    continue;
                }
                for (PaperCreateRequest.QuestionInput qi : si.getQuestions()) {
                    PaperQuestion q = new PaperQuestion();
                    q.setPaperId(paper.getId());
                    q.setSectionId(section.getId());
                    q.setOrderNo(qi.getOrderNo() == null ? total + 1 : qi.getOrderNo());
                    q.setStem(qi.getStem());
                    q.setOptions(qi.getOptions());
                    q.setAnswer(qi.getAnswer());
                    q.setAnalysis(qi.getAnalysis());
                    q.setDone(false);
                    q.setFavorite(false);
                    q.setCreateTime(LocalDateTime.now());
                    q.setUpdateTime(LocalDateTime.now());
                    questionMapper.insert(q);
                    total++;
                }
            }
        }
        paper.setTotalCount(total);
        paperMapper.updateById(paper);
        log.info("保存试卷：id={}, 题目数={}", paper.getId(), total);
        return paper.getId();
    }

    /**
     * 克隆内置示范卷到当前用户
     */
    @Transactional
    public Long clone(Long paperId, Long userId) {
        PaperDetailVo src = detail(paperId);
        PaperCreateRequest req = new PaperCreateRequest();
        req.setTitle(src.getTitle());
        req.setLevel(src.getLevel());
        req.setYearMonth(src.getYearMonth());
        req.setSource("内置示范卷");
        req.setRawText(src.getRawText());
        List<PaperCreateRequest.SectionInput> sections = new ArrayList<>();
        for (PaperDetailVo.SectionVo sv : src.getSectionList()) {
            PaperCreateRequest.SectionInput si = new PaperCreateRequest.SectionInput();
            si.setType(sv.getType());
            si.setTitle(sv.getTitle());
            si.setPassage(sv.getPassage());
            List<PaperCreateRequest.QuestionInput> qs = new ArrayList<>();
            for (PaperQuestion q : sv.getQuestions()) {
                PaperCreateRequest.QuestionInput qi = new PaperCreateRequest.QuestionInput();
                qi.setOrderNo(q.getOrderNo());
                qi.setStem(q.getStem());
                qi.setOptions(q.getOptions());
                qi.setAnswer(q.getAnswer());
                qi.setAnalysis(q.getAnalysis());
                qs.add(qi);
            }
            si.setQuestions(qs);
            sections.add(si);
        }
        req.setSections(sections);
        return create(userId, req);
    }

    @Transactional
    public void delete(Long userId, Long paperId) {
        Paper paper = paperMapper.selectById(paperId);
        if (paper == null) {
            return;
        }
        if (!Long.valueOf(0).equals(paper.getUserId()) && !paper.getUserId().equals(userId)) {
            throw new BizException("无权删除他人试卷");
        }
        questionMapper.delete(new LambdaQueryWrapper<PaperQuestion>().eq(PaperQuestion::getPaperId, paperId));
        sectionMapper.delete(new LambdaQueryWrapper<PaperSection>().eq(PaperSection::getPaperId, paperId));
        paperMapper.deleteById(paperId);
    }

    @Transactional
    public Paper update(Long userId, Long paperId, Paper body) {
        Paper paper = paperMapper.selectById(paperId);
        if (paper == null) {
            throw new BizException("试卷不存在");
        }
        if (!paper.getUserId().equals(userId)) {
            throw new BizException("无权修改该试卷");
        }
        if (body.getTitle() != null) {
            paper.setTitle(body.getTitle());
        }
        if (body.getLevel() != null) {
            paper.setLevel(body.getLevel());
        }
        if (body.getYearMonth() != null) {
            paper.setYearMonth(body.getYearMonth());
        }
        paper.setUpdateTime(LocalDateTime.now());
        paperMapper.updateById(paper);
        return paperMapper.selectById(paperId);
    }

    /* -------------------------------------------------- 单题 -------------------------------------------------- */

    /**
     * 单题作答 / 收藏 / 完成状态
     */
    @Transactional
    public PaperQuestion updateQuestion(Long questionId, QuestionUpdateRequest req) {
        PaperQuestion q = questionMapper.selectById(questionId);
        if (q == null) {
            throw new BizException("题目不存在：" + questionId);
        }
        if (req.getUserAnswer() != null) {
            q.setUserAnswer(req.getUserAnswer());
        }
        if (req.getDone() != null) {
            q.setDone(req.getDone());
        }
        if (req.getFavorite() != null) {
            q.setFavorite(req.getFavorite());
        }
        q.setUpdateTime(LocalDateTime.now());
        questionMapper.updateById(q);

        if (req.getUserAnswer() != null) {
            syncPaperError(q);
        }

        recalcProgress(q.getPaperId());
        return questionMapper.selectById(questionId);
    }

    /**
     * 真题错题本联动（与前端 {@code mock.ts#syncPaperError} 保持一致）。
     *
     * <p>只有**卷面附了答案键**才能判对错 —— 真题 PDF 普遍不附答案（答案另出一册），
     * 没有答案键时不猜、不收录，否则会把答对的题也记成错题。
     * 答对、或重做本题清空作答时，把该题的错题记录移出。
     */
    private void syncPaperError(PaperQuestion q) {
        Paper paper = paperMapper.selectById(q.getPaperId());
        if (paper == null) {
            return;
        }
        Long userId = paper.getUserId();
        ErrorBook exist = errorBookMapper.selectOne(new LambdaQueryWrapper<ErrorBook>()
                .eq(ErrorBook::getUserId, userId)
                .eq(ErrorBook::getSourceType, "PAPER")
                .eq(ErrorBook::getSourceId, String.valueOf(q.getId())));

        String mine = q.getUserAnswer() == null ? "" : q.getUserAnswer().trim().toUpperCase();
        if (mine.isEmpty()) {
            if (exist != null) {
                errorBookMapper.deleteById(exist.getId());
            }
            return;
        }
        String key = answerKey(q.getAnswer());
        if (key.isEmpty()) {
            return;
        }
        if (mine.equals(key)) {
            if (exist != null) {
                errorBookMapper.deleteById(exist.getId());
            }
            return;
        }

        String rightAnswer = key;
        if (q.getOptions() != null) {
            for (String o : q.getOptions()) {
                if (key.equals(optionLetter(o))) {
                    rightAnswer = o;
                    break;
                }
            }
        }

        ErrorBook eb = exist == null ? new ErrorBook() : exist;
        eb.setUserId(userId);
        eb.setSourceType("PAPER");
        eb.setSourceId(String.valueOf(q.getId()));
        eb.setTitle(paper.getTitle() + " · 第 " + q.getOrderNo() + " 题");
        eb.setContent(q.getStem() == null || q.getStem().isBlank() ? "（本题无题干，听力题干在音频中）" : q.getStem());
        eb.setUserAnswer(mine);
        eb.setRightAnswer(rightAnswer);
        eb.setNote("答错：你选了 " + mine + "，正确答案是 " + key);
        eb.setResolved(false);
        eb.setUpdateTime(LocalDateTime.now());
        if (eb.getId() == null) {
            eb.setCreateTime(LocalDateTime.now());
            errorBookMapper.insert(eb);
        } else {
            errorBookMapper.updateById(eb);
        }
    }

    /**
     * 取答案字母。
     *
     * <p>字母必须跟分隔符或行尾：{@code "A"} / {@code "A)"} / {@code "A. because..."} 都算 A，
     * 但 {@code "Books are useful"} 不能读成 B。字母范围放到 <b>A~O</b> —— 长篇阅读
     * （段落匹配）的答案是段落标号，会用到 E~O。
     */
    static String answerKey(String raw) {
        if (raw == null) {
            return "";
        }
        String t = raw.trim().toUpperCase();
        if (t.isEmpty()) {
            return "";
        }
        char c = t.charAt(0);
        if (c < 'A' || c > 'O') {
            return "";
        }
        if (t.length() == 1) {
            return String.valueOf(c);
        }
        char d = t.charAt(1);
        boolean sep = d == ')' || d == '.' || d == '、' || d == '）' || d == ':' || d == '：'
                || Character.isWhitespace(d);
        return sep ? String.valueOf(c) : "";
    }

    /** 从 "A) xxx" 里取选项字母，用于把 "A" 还原成完整选项文本 */
    static String optionLetter(String opt) {
        if (opt == null) {
            return "";
        }
        String s = opt.trim();
        if (s.isEmpty()) {
            return "";
        }
        char c = Character.toUpperCase(s.charAt(0));
        return (c >= 'A' && c <= 'O') ? String.valueOf(c) : s;
    }

    /**
     * 重算试卷完成进度
     */
    private void recalcProgress(Long paperId) {
        Paper p = paperMapper.selectById(paperId);
        if (p == null) {
            return;
        }
        Long total = questionMapper.countByPaper(paperId);
        Long done = questionMapper.countDoneByPaper(paperId);
        p.setTotalCount(total == null ? 0 : total.intValue());
        p.setDoneCount(done == null ? 0 : done.intValue());
        p.setUpdateTime(LocalDateTime.now());
        paperMapper.updateById(p);
    }

    /**
     * 试卷进度
     */
    public Map<String, Object> progress(Long paperId) {
        Paper p = paperMapper.selectById(paperId);
        if (p == null) {
            throw new BizException("试卷不存在");
        }
        int total = p.getTotalCount() == null ? 0 : p.getTotalCount();
        int done = p.getDoneCount() == null ? 0 : p.getDoneCount();
        return Map.of(
                "paperId", paperId,
                "total", total,
                "done", done,
                "percent", total == 0 ? 0 : (int) Math.round(done * 100.0 / total)
        );
    }

    public List<PaperQuestion> favorites(Long userId) {
        List<Paper> papers = list(userId);
        List<PaperQuestion> result = new ArrayList<>();
        for (Paper p : papers) {
            result.addAll(questionMapper.selectList(new LambdaQueryWrapper<PaperQuestion>()
                    .eq(PaperQuestion::getPaperId, p.getId())
                    .eq(PaperQuestion::getFavorite, true)));
        }
        result.sort(Comparator.comparing(PaperQuestion::getUpdateTime,
                Comparator.nullsLast(Comparator.reverseOrder())));
        return result;
    }

    private void copyPaper(Paper src, Paper target) {
        target.setId(src.getId());
        target.setUserId(src.getUserId());
        target.setTitle(src.getTitle());
        target.setLevel(src.getLevel());
        target.setYearMonth(src.getYearMonth());
        target.setSource(src.getSource());
        target.setRawText(src.getRawText());
        target.setTotalCount(src.getTotalCount());
        target.setDoneCount(src.getDoneCount());
        target.setCreateTime(src.getCreateTime());
        target.setUpdateTime(src.getUpdateTime());
    }
}
