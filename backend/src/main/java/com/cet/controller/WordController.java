package com.cet.controller;

import com.cet.common.Result;
import com.cet.common.UserContext;
import com.cet.dto.TodayWordsVo;
import com.cet.dto.WordSubmitRequest;
import com.cet.dto.WordVo;
import com.cet.service.WordService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 单词接口：词库、今日队列、学习反馈、生词本
 */
@RestController
@RequestMapping("/api/words")
@RequiredArgsConstructor
public class WordController {

    private final WordService wordService;
    private final com.cet.service.UserService userService;

    /** 词库列表：level / keyword / status(NEW|LEARNING|KNOWN|NOTEBOOK|ALL) */
    @GetMapping
    public Result<List<WordVo>> list(@RequestParam(required = false) String level,
                                     @RequestParam(required = false) String keyword,
                                     @RequestParam(required = false) String status) {
        String lv = (level == null || level.isBlank())
                ? defaultLevel()
                : level;
        return Result.ok(wordService.list(UserContext.getUserId(), lv, keyword, status));
    }

    /** 今日学习队列（新学 + 到期复习） */
    @GetMapping("/today")
    public Result<TodayWordsVo> today(@RequestParam(required = false) String level) {
        return Result.ok(wordService.todayQueue(UserContext.getUserId(),
                (level == null || level.isBlank()) ? defaultLevel() : level));
    }

    /** 提交学习反馈：KNOWN 认识 / FUZZY 模糊 / UNKNOWN 不认识 */
    @PostMapping("/progress")
    public Result<WordVo> submit(@Valid @RequestBody WordSubmitRequest req) {
        return Result.ok(wordService.submit(UserContext.getUserId(), req));
    }

    /** 生词本 */
    @GetMapping("/notebook")
    public Result<List<WordVo>> notebook() {
        return Result.ok(wordService.notebook(UserContext.getUserId()));
    }

    /** 加入 / 移出生词本 */
    @PostMapping("/notebook/toggle")
    public Result<WordVo> toggleNotebook(@RequestBody Map<String, Object> body) {
        String wordId = String.valueOf(body.get("wordId"));
        Integer flag = body.get("inNotebook") == null ? 1 : Integer.parseInt(String.valueOf(body.get("inNotebook")));
        return Result.ok(wordService.toggleNotebook(UserContext.getUserId(), wordId, flag));
    }

    /** 按状态取词：KNOWN 已掌握 / LEARNING 学习中 */
    @GetMapping("/status")
    public Result<List<WordVo>> byStatus(@RequestParam String status,
                                         @RequestParam(required = false) String level) {
        return Result.ok(wordService.byStatus(UserContext.getUserId(),
                (level == null || level.isBlank()) ? defaultLevel() : level, status));
    }

    /** 重置某等级学习进度 */
    @PostMapping("/reset")
    public Result<Integer> reset(@RequestBody Map<String, Object> body) {
        String level = body.get("level") == null ? defaultLevel() : String.valueOf(body.get("level"));
        return Result.ok(wordService.reset(UserContext.getUserId(), level));
    }

    /** 待复习数量 */
    @GetMapping("/due-count")
    public Result<Long> dueCount(@RequestParam(required = false) String level) {
        return Result.ok(wordService.countDue(UserContext.getUserId(),
                (level == null || level.isBlank()) ? defaultLevel() : level));
    }

    /** 未指定等级时，跟随用户当前备考等级 */
    private String defaultLevel() {
        var user = userService.getById(UserContext.getUserId());
        return (user == null || user.getCurrentLevel() == null) ? "CET4" : user.getCurrentLevel();
    }
}
