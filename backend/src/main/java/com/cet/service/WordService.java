package com.cet.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cet.common.BizException;
import com.cet.common.CacheService;
import com.cet.dto.TodayWordsVo;
import com.cet.dto.WordSubmitRequest;
import com.cet.dto.WordVo;
import com.cet.entity.User;
import com.cet.entity.Word;
import com.cet.entity.WordProgress;
import com.cet.mapper.WordMapper;
import com.cet.mapper.WordProgressMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 单词学习服务：定量学习 + 遗忘曲线复习 + 生词本 / 已掌握标记
 *
 * <p><b>遗忘曲线（艾宾浩斯简化版）</b>：共 8 个阶段，答对升阶、答错降 2 阶。
 * 相邻阶段间隔（天）见 {@link #INTERVAL_DAYS}：0→当天，1→1天，2→2天，4→7天…最长 60 天。
 * 连续答对升到 5 阶以上即判定为“已掌握”。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WordService {

    private final WordMapper wordMapper;
    private final WordProgressMapper progressMapper;
    private final CheckinService checkinService;
    private final UserService userService;
    private final CacheService cacheService;

    /** 各阶段复习间隔（天） */
    public static final int[] INTERVAL_DAYS = {0, 1, 2, 4, 7, 15, 30, 60};

    /** 最高阶段 */
    private static final int MAX_STAGE = INTERVAL_DAYS.length - 1;

    /** 达到该阶段视为已掌握 */
    private static final int KNOWN_STAGE = 5;

    /**
     * 下一次复习时间：<b>按「天」调度</b>，落在目标日期的 00:00。
     *
     * <p>这里不能用 {@code now.plusDays(n)}。那样昨晚 22:00 背的词会算成今晚 22:00 才到期，
     * 第二天白天打开应用复习队列是空的，看起来就像昨天的数据没存上。
     * 记忆曲线的间隔本来就是按天算的，落到当天 00:00 才符合直觉，也才能和前端
     * {@code mock.ts#nextReviewDate} 保持一致。
     */
    static LocalDateTime nextReviewDate(int daysFromToday) {
        return LocalDate.now().plusDays(daysFromToday).atStartOfDay();
    }

    /* -------------------------------------------------- 查询 -------------------------------------------------- */

    /**
     * 词库列表（带当前用户进度）
     */
    public List<WordVo> list(Long userId, String level, String keyword, String status) {
        List<Word> words = loadWords(level);
        Map<String, WordProgress> progressMap = progressMap(userId);

        return words.stream()
                .filter(w -> !StringUtils.hasText(keyword)
                        || w.getWord().toLowerCase().contains(keyword.toLowerCase())
                        || w.getMeaning().contains(keyword))
                .filter(w -> {
                    if (!StringUtils.hasText(status) || "ALL".equalsIgnoreCase(status)) {
                        return true;
                    }
                    WordProgress p = progressMap.get(w.getId());
                    String st = p == null ? "NEW" : p.getStatus();
                    if ("NOTEBOOK".equalsIgnoreCase(status)) {
                        return p != null && Integer.valueOf(1).equals(p.getInNotebook());
                    }
                    return status.equalsIgnoreCase(st);
                })
                .map(w -> toVo(w, progressMap.get(w.getId()), "new"))
                .collect(Collectors.toList());
    }

    /**
     * 今日学习队列：待学新词 + 到期复习词
     */
    public TodayWordsVo todayQueue(Long userId, String level) {
        User user = userService.getById(userId);
        int goal = user.getDailyGoal() == null ? 20 : user.getDailyGoal();
        int reviewGoal = user.getReviewGoal() == null ? 40 : user.getReviewGoal();

        CheckinRecord today = currentCheckin(userId, goal);
        int learnedToday = today.learnCount;
        int reviewedToday = today.reviewCount;

        int newNeed = Math.max(0, goal - learnedToday);
        int reviewNeed = Math.max(0, reviewGoal - reviewedToday);

        LocalDateTime now = LocalDateTime.now();
        List<Word> newWords = newNeed > 0
                ? wordMapper.selectNewWords(userId, level, newNeed)
                : List.of();
        List<Word> dueWords = reviewNeed > 0
                ? wordMapper.selectDueWords(userId, level, now, reviewNeed)
                : List.of();

        Map<String, WordProgress> progressMap = progressMap(userId);

        TodayWordsVo vo = new TodayWordsVo();
        vo.setLevel(level);
        vo.setDate(LocalDate.now().toString());
        vo.setGoal(goal);
        vo.setReviewGoal(reviewGoal);
        vo.setLearnedToday(learnedToday);
        vo.setReviewedToday(reviewedToday);
        vo.setNewWords(newWords.stream()
                .map(w -> toVo(w, progressMap.get(w.getId()), "new"))
                .collect(Collectors.toList()));
        vo.setReviewWords(dueWords.stream()
                .map(w -> toVo(w, progressMap.get(w.getId()), "review"))
                .collect(Collectors.toList()));
        return vo;
    }

    /**
     * 生词本
     */
    public List<WordVo> notebook(Long userId) {
        Map<String, WordProgress> progressMap = progressMap(userId);
        return wordMapper.selectNotebook(userId).stream()
                .map(w -> toVo(w, progressMap.get(w.getId()), "review"))
                .collect(Collectors.toList());
    }

    /**
     * 按状态取词（KNOWN 已掌握 / LEARNING 学习中）
     */
    public List<WordVo> byStatus(Long userId, String level, String status) {
        Map<String, WordProgress> progressMap = progressMap(userId);
        return wordMapper.selectByStatus(userId, level, status).stream()
                .map(w -> toVo(w, progressMap.get(w.getId()), "review"))
                .collect(Collectors.toList());
    }

    /* -------------------------------------------------- 学习与复习 -------------------------------------------------- */

    /**
     * 提交学习反馈，按遗忘曲线推进
     *
     * @param result KNOWN 认识 / FUZZY 模糊 / UNKNOWN 不认识
     */
    @Transactional
    public WordVo submit(Long userId, WordSubmitRequest req) {
        Word word = wordMapper.selectById(req.getWordId());
        if (word == null) {
            throw new BizException("单词不存在：" + req.getWordId());
        }
        User user = userService.getById(userId);
        int goal = user.getDailyGoal() == null ? 20 : user.getDailyGoal();

        WordProgress p = progressMapper.selectByUserAndWord(userId, req.getWordId());
        boolean isNew = p == null;
        if (isNew) {
            p = new WordProgress();
            p.setUserId(userId);
            p.setWordId(req.getWordId());
            p.setStatus("NEW");
            p.setStage(0);
            p.setFamiliarity(0);
            p.setReviewCount(0);
            p.setLapseCount(0);
            p.setInNotebook(0);
            p.setCreateTime(LocalDateTime.now());
        }

        LocalDateTime now = LocalDateTime.now();
        String result = (req.getResult() == null ? "KNOWN" : req.getResult()).toUpperCase();

        switch (result) {
            case "KNOWN" -> {
                p.setStage(Math.min(MAX_STAGE, p.getStage() + 1));
                p.setFamiliarity(Math.min(5, p.getFamiliarity() + 1));
                p.setNextReviewAt(nextReviewDate(INTERVAL_DAYS[p.getStage()]));
                if (p.getFamiliarity() >= 3) {
                    p.setInNotebook(0);
                }
            }
            case "FUZZY" -> {
                // 模糊：不升阶，明天再练一遍（按天调度，理由见 nextReviewDate 注释）
                p.setFamiliarity(Math.max(0, p.getFamiliarity()));
                p.setNextReviewAt(nextReviewDate(1));
                p.setInNotebook(1);
            }
            case "UNKNOWN" -> {
                // 不认识：降 2 阶、记一次遗忘、进入生词本、5 分钟后再练
                p.setStage(Math.max(0, p.getStage() - 2));
                p.setFamiliarity(Math.max(0, p.getFamiliarity() - 1));
                p.setLapseCount(p.getLapseCount() + 1);
                p.setInNotebook(1);
                p.setNextReviewAt(now.plusMinutes(5));
            }
            default -> throw new BizException("未知的反馈类型：" + result);
        }

        p.setStatus(p.getStage() >= KNOWN_STAGE ? "KNOWN" : "LEARNING");
        p.setReviewCount(p.getReviewCount() + 1);
        p.setLastReviewAt(now);
        p.setUpdateTime(now);

        if (isNew) {
            progressMapper.insert(p);
        } else {
            progressMapper.updateById(p);
        }

        // 打卡计数：新学 +1，复习 +1
        boolean isReview = "review".equalsIgnoreCase(req.getMode()) && !isNew;
        if (isReview) {
            checkinService.addProgress(userId, 0, 1, goal);
        } else {
            checkinService.addProgress(userId, 1, 0, goal);
        }

        invalidateCache(userId);
        return toVo(word, p, req.getMode());
    }

    /**
     * 手动加入 / 移出生词本
     */
    @Transactional
    public WordVo toggleNotebook(Long userId, String wordId, Integer flag) {
        Word word = wordMapper.selectById(wordId);
        if (word == null) {
            throw new BizException("单词不存在");
        }
        WordProgress p = progressMapper.selectByUserAndWord(userId, wordId);
        if (p == null) {
            p = new WordProgress();
            p.setUserId(userId);
            p.setWordId(wordId);
            p.setStatus("LEARNING");
            p.setStage(0);
            p.setFamiliarity(0);
            p.setReviewCount(0);
            p.setLapseCount(0);
            p.setCreateTime(LocalDateTime.now());
        }
        int target = flag != null && flag == 1 ? 1 : 0;
        p.setInNotebook(target == 1 ? 1 : 0);
        if (target == 1) {
            p.setStatus("LEARNING");
            p.setNextReviewAt(nextReviewDate(1));
        }
        p.setUpdateTime(LocalDateTime.now());
        if (p.getId() == null) {
            progressMapper.insert(p);
        } else {
            progressMapper.updateById(p);
        }
        invalidateCache(userId);
        return toVo(word, p, "review");
    }

    /**
     * 重置某等级的学习进度
     */
    @Transactional
    public int reset(Long userId, String level) {
        List<Word> words = loadWords(level);
        List<String> ids = words.stream().map(Word::getId).toList();
        int n = 0;
        for (String id : ids) {
            n += progressMapper.delete(new LambdaQueryWrapper<WordProgress>()
                    .eq(WordProgress::getUserId, userId)
                    .eq(WordProgress::getWordId, id));
        }
        invalidateCache(userId);
        return n;
    }

    /* -------------------------------------------------- 工具方法 -------------------------------------------------- */

    /**
     * 词库缓存 1 小时
     */
    private List<Word> loadWords(String level) {
        String cacheKey = cacheService.key("words", level);
        return cacheService.getOrLoad(cacheKey, 3600L, () -> wordMapper.selectByLevel(level));
    }

    private Map<String, WordProgress> progressMap(Long userId) {
        List<WordProgress> list = progressMapper.selectList(
                new LambdaQueryWrapper<WordProgress>().eq(WordProgress::getUserId, userId));
        Map<String, WordProgress> map = new HashMap<>(list.size() * 2);
        for (WordProgress p : list) {
            map.put(p.getWordId(), p);
        }
        return map;
    }

    private CheckinRecord currentCheckin(Long userId, int goal) {
        var c = checkinService.today(userId, goal);
        CheckinRecord r = new CheckinRecord();
        r.learnCount = c.getLearnCount() == null ? 0 : c.getLearnCount();
        r.reviewCount = c.getReviewCount() == null ? 0 : c.getReviewCount();
        return r;
    }

    private WordVo toVo(Word w, WordProgress p, String mode) {
        WordVo vo = new WordVo();
        vo.setId(w.getId());
        vo.setLevel(w.getLevel());
        vo.setWord(w.getWord());
        vo.setPhonetic(w.getPhonetic());
        vo.setPos(w.getPos());
        vo.setMeaning(w.getMeaning());
        vo.setExampleEn(w.getExampleEn());
        vo.setExampleZh(w.getExampleZh());
        vo.setSource(w.getSource());
        vo.setFreqRank(w.getFreqRank());
        vo.setMode(mode);
        if (p != null) {
            vo.setStatus(p.getStatus());
            vo.setFamiliarity(p.getFamiliarity());
            vo.setInNotebook(p.getInNotebook());
            vo.setReviewCount(p.getReviewCount());
            vo.setLapseCount(p.getLapseCount());
            vo.setNextReviewAt(p.getNextReviewAt() == null ? null : p.getNextReviewAt().toString());
        }
        return vo;
    }

    private void invalidateCache(Long userId) {
        // 学习进度变化不缓存，这里仅清理统计类缓存
        cacheService.deleteByPattern(cacheService.key("stats", userId + "*"));
    }

    private static class CheckinRecord {
        int learnCount;
        int reviewCount;
    }

    /** 供外部按词取 Vo */
    public WordVo findVo(Long userId, String wordId) {
        Word w = wordMapper.selectById(wordId);
        if (w == null) {
            return null;
        }
        return toVo(w, progressMapper.selectByUserAndWord(userId, wordId), "review");
    }

    public Function<String, WordProgress> progressFinder(Long userId) {
        Map<String, WordProgress> map = progressMap(userId);
        return map::get;
    }

    public Long countDue(Long userId, String level) {
        return progressMapper.countDue(userId, level, LocalDateTime.now());
    }
}
