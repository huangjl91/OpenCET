package com.cet.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cet.common.CacheService;
import com.cet.dto.StatsVo;
import com.cet.entity.Checkin;
import com.cet.entity.Paper;
import com.cet.entity.TranslationAttempt;
import com.cet.entity.User;
import com.cet.entity.Word;
import com.cet.entity.WordProgress;
import com.cet.mapper.PaperMapper;
import com.cet.mapper.TranslationAttemptMapper;
import com.cet.mapper.WordMapper;
import com.cet.mapper.WordProgressMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 首页总览统计（Redis 缓存 5 分钟）
 */
@Service
@RequiredArgsConstructor
public class StatsService {

    private final UserService userService;
    private final WordMapper wordMapper;
    private final WordProgressMapper progressMapper;
    private final CheckinService checkinService;
    private final TranslationAttemptMapper attemptMapper;
    private final PaperMapper paperMapper;
    private final ErrorBookService errorBookService;
    private final CacheService cacheService;

    public StatsVo overview(Long userId) {
        String cacheKey = cacheService.key("stats", String.valueOf(userId));
        return cacheService.getOrLoad(cacheKey, 300L, () -> compute(userId));
    }

    private StatsVo compute(Long userId) {
        User user = userService.getById(userId);
        String level = user.getCurrentLevel() == null ? "CET4" : user.getCurrentLevel();

        List<WordProgress> progresses = progressMapper.selectList(
                new LambdaQueryWrapper<WordProgress>().eq(WordProgress::getUserId, userId));
        Map<String, WordProgress> map = progresses.stream()
                .collect(Collectors.toMap(WordProgress::getWordId, p -> p, (a, b) -> a));

        List<Word> words = wordMapper.selectByLevel(level);
        long wordTotal = words.size();

        long learnedTotal = progresses.size();
        long knownTotal = progresses.stream().filter(p -> "KNOWN".equals(p.getStatus())).count();
        long notebookTotal = progresses.stream().filter(p -> Integer.valueOf(1).equals(p.getInNotebook())).count();
        long reviewTotal = progresses.stream().mapToLong(p -> p.getReviewCount() == null ? 0 : p.getReviewCount()).sum();

        LocalDateTime now = LocalDateTime.now();
        long dueTotal = progresses.stream().filter(p ->
                !"KNOWN".equals(p.getStatus())
                        && p.getNextReviewAt() != null
                        && !p.getNextReviewAt().isAfter(now)).count();

        Checkin today = checkinService.today(userId, user.getDailyGoal() == null ? 20 : user.getDailyGoal());

        List<TranslationAttempt> attempts = attemptMapper.selectByLevel(userId, level, 1000);
        long translationCount = attempts.stream().map(TranslationAttempt::getQuestionId).distinct().count();
        int avg = (int) Math.round(attempts.stream()
                .mapToInt(a -> a.getScore() == null ? 0 : a.getScore())
                .average().orElse(0));

        List<Paper> papers = paperMapper.selectList(new LambdaQueryWrapper<Paper>().eq(Paper::getUserId, userId));
        long paperTotalCount = papers.stream().mapToLong(p -> p.getTotalCount() == null ? 0 : p.getTotalCount()).sum();
        long paperDoneCount = papers.stream().mapToLong(p -> p.getDoneCount() == null ? 0 : p.getDoneCount()).sum();

        StatsVo vo = new StatsVo();
        vo.setLevel(level);
        vo.setLearnedTotal(learnedTotal);
        vo.setReviewTotal(reviewTotal);
        vo.setKnownTotal(knownTotal);
        vo.setNotebookTotal(notebookTotal);
        vo.setDueTotal(Math.min(dueTotal, wordTotal));
        vo.setWordTotal(wordTotal);
        vo.setStreak(checkinService.streak(userId));
        vo.setLongestStreak(checkinService.longestStreak(userId));
        vo.setCheckinDays(checkinService.checkinDays(userId));
        vo.setTodayDone(Boolean.TRUE.equals(today.getDone()));
        vo.setLearnedToday(today.getLearnCount());
        vo.setReviewedToday(today.getReviewCount());
        vo.setDailyGoal(user.getDailyGoal());
        vo.setTranslationCount(translationCount);
        vo.setTranslationAvgScore(avg);
        vo.setPaperCount((long) papers.size());
        vo.setPaperTotalCount(paperTotalCount);
        vo.setPaperDoneCount(paperDoneCount);
        vo.setErrorCount((long) errorBookService.list(userId, null, null).size());
        return vo;
    }
}
