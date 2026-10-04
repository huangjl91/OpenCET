package com.cet.controller;

import com.cet.common.Result;
import com.cet.common.UserContext;
import com.cet.dto.TranslationResultVo;
import com.cet.dto.TranslationReviewRequest;
import com.cet.dto.TranslationSubmitRequest;
import com.cet.entity.TranslationAttempt;
import com.cet.entity.TranslationQuestion;
import com.cet.service.TranslationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 翻译练习接口
 */
@RestController
@RequestMapping("/api/translation")
@RequiredArgsConstructor
public class TranslationController {

    private final TranslationService translationService;
    private final com.cet.service.UserService userService;

    /** 题目列表：level / type(sentence|paragraph) / difficulty(1-3) */
    @GetMapping("/questions")
    public Result<List<TranslationQuestion>> questions(@RequestParam(required = false) String level,
                                                       @RequestParam(required = false) String type,
                                                       @RequestParam(required = false) Integer difficulty) {
        String lv = (level == null || level.isBlank()) ? defaultLevel() : level;
        return Result.ok(translationService.list(lv, type, difficulty));
    }

    @GetMapping("/questions/{id}")
    public Result<TranslationQuestion> question(@PathVariable String id) {
        return Result.ok(translationService.get(id));
    }

    /** 提交译文：返回机器分、评分构成明细、参考答案、核心词汇、语法点解析 */
    @PostMapping("/submit")
    public Result<TranslationResultVo> submit(@Valid @RequestBody TranslationSubmitRequest req) {
        return Result.ok(translationService.submit(UserContext.getUserId(), req));
    }

    /**
     * 回填 LLM 二次润色评分
     *
     * <p>模型调用由浏览器直连完成（API Key 只存本机 localStorage），后端只接收结论并持久化，
     * 随后按综合分重新判定错题本。
     */
    @PostMapping("/review")
    public Result<TranslationResultVo> review(@Valid @RequestBody TranslationReviewRequest req) {
        return Result.ok(translationService.review(UserContext.getUserId(), req));
    }

    /** 作答历史 */
    @GetMapping("/attempts")
    public Result<List<TranslationAttempt>> attempts(@RequestParam(required = false) String level,
                                                     @RequestParam(defaultValue = "50") int limit) {
        return Result.ok(translationService.attempts(UserContext.getUserId(),
                (level == null || level.isBlank()) ? defaultLevel() : level, limit));
    }

    /** 某题的作答历史 */
    @GetMapping("/attempts/{questionId}")
    public Result<List<TranslationAttempt>> attemptsOfQuestion(@PathVariable String questionId) {
        return Result.ok(translationService.attemptsOfQuestion(UserContext.getUserId(), questionId));
    }

    /** 翻译错题 */
    @GetMapping("/wrongs")
    public Result<List<TranslationAttempt>> wrongs(@RequestParam(required = false) String level) {
        return Result.ok(translationService.wrongs(UserContext.getUserId(),
                (level == null || level.isBlank()) ? defaultLevel() : level));
    }

    private String defaultLevel() {
        var user = userService.getById(UserContext.getUserId());
        return (user == null || user.getCurrentLevel() == null) ? "CET4" : user.getCurrentLevel();
    }
}
