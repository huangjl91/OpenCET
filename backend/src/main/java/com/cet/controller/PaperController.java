package com.cet.controller;

import com.cet.common.Result;
import com.cet.common.UserContext;
import com.cet.dto.PaperCreateRequest;
import com.cet.dto.PaperDetailVo;
import com.cet.dto.QuestionUpdateRequest;
import com.cet.entity.Paper;
import com.cet.entity.PaperQuestion;
import com.cet.service.PaperService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 真题拆解接口
 */
@RestController
@RequestMapping("/api/papers")
@RequiredArgsConstructor
public class PaperController {

    private final PaperService paperService;

    /** 我的试卷列表 */
    @GetMapping
    public Result<List<Paper>> list() {
        return Result.ok(paperService.list(UserContext.getUserId()));
    }

    /** 内置示范卷 */
    @GetMapping("/presets")
    public Result<List<Paper>> presets() {
        return Result.ok(paperService.presets());
    }

    /** 保存切分后的真题 */
    @PostMapping
    public Result<Map<String, Object>> create(@Valid @RequestBody PaperCreateRequest req) {
        Long id = paperService.create(UserContext.getUserId(), req);
        return Result.ok(Map.of("id", id));
    }

    /** 试卷详情（含模块与单题） */
    @GetMapping("/{id}")
    public Result<PaperDetailVo> detail(@PathVariable Long id) {
        return Result.ok(paperService.detail(id));
    }

    /** 克隆内置示范卷到我的试卷 */
    @PostMapping("/{id}/clone")
    public Result<Map<String, Object>> clone(@PathVariable Long id) {
        return Result.ok(Map.of("id", paperService.clone(id, UserContext.getUserId())));
    }

    @PutMapping("/{id}")
    public Result<Paper> update(@PathVariable Long id, @RequestBody Paper body) {
        return Result.ok(paperService.update(UserContext.getUserId(), id, body));
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        paperService.delete(UserContext.getUserId(), id);
        return Result.ok();
    }

    /** 单题作答 / 收藏 / 完成状态 */
    @PutMapping("/questions/{questionId}")
    public Result<PaperQuestion> updateQuestion(@PathVariable Long questionId,
                                                @RequestBody QuestionUpdateRequest req) {
        return Result.ok(paperService.updateQuestion(questionId, req));
    }

    /** 试卷进度 */
    @GetMapping("/{id}/progress")
    public Result<Map<String, Object>> progress(@PathVariable Long id) {
        return Result.ok(paperService.progress(id));
    }

    /** 我收藏的题目（跨试卷） */
    @GetMapping("/favorites")
    public Result<List<PaperQuestion>> favorites() {
        return Result.ok(paperService.favorites(UserContext.getUserId()));
    }
}
