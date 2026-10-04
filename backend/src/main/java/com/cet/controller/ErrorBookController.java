package com.cet.controller;

import com.cet.common.Result;
import com.cet.common.UserContext;
import com.cet.entity.ErrorBook;
import com.cet.service.ErrorBookService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 错题本接口
 */
@RestController
@RequestMapping("/api/errors")
@RequiredArgsConstructor
public class ErrorBookController {

    private final ErrorBookService errorBookService;

    /** 错题列表：sourceType(WORD|TRANSLATION|PAPER)、resolved(0|1) 可选 */
    @GetMapping
    public Result<List<ErrorBook>> list(@RequestParam(required = false) String sourceType,
                                        @RequestParam(required = false) Integer resolved) {
        return Result.ok(errorBookService.list(UserContext.getUserId(), sourceType, resolved));
    }

    /** 标记已掌握 / 修改笔记 */
    @PutMapping("/{id}")
    public Result<ErrorBook> update(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        return Result.ok(errorBookService.update(UserContext.getUserId(), id, body));
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        errorBookService.delete(UserContext.getUserId(), id);
        return Result.ok();
    }

    @DeleteMapping
    public Result<Void> clear(@RequestParam(required = false) String sourceType) {
        errorBookService.clear(UserContext.getUserId(), sourceType);
        return Result.ok();
    }
}
