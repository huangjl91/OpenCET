package com.cet.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cet.common.BizException;
import com.cet.entity.ErrorBook;
import com.cet.mapper.ErrorBookMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 错题本服务：单词 / 翻译 / 真题统一收纳
 */
@Service
@RequiredArgsConstructor
public class ErrorBookService {

    private final ErrorBookMapper errorBookMapper;

    public List<ErrorBook> list(Long userId, String sourceType, Integer resolved) {
        return errorBookMapper.selectList(new LambdaQueryWrapper<ErrorBook>()
                .eq(ErrorBook::getUserId, userId)
                .eq(sourceType != null && !sourceType.isBlank(), ErrorBook::getSourceType, sourceType)
                .eq(resolved != null, ErrorBook::getResolved, resolved)
                .orderByDesc(ErrorBook::getCreateTime));
    }

    @Transactional
    public ErrorBook update(Long userId, Long id, Map<String, Object> body) {
        ErrorBook eb = errorBookMapper.selectById(id);
        if (eb == null) {
            throw new BizException("错题不存在：" + id);
        }
        if (!eb.getUserId().equals(userId)) {
            throw new BizException("无权操作该记录");
        }
        if (body.get("resolved") != null) {
            Object v = body.get("resolved");
            eb.setResolved(v instanceof Boolean b ? b : Boolean.parseBoolean(String.valueOf(v)));
        }
        if (body.get("note") != null) {
            eb.setNote(String.valueOf(body.get("note")));
        }
        eb.setUpdateTime(LocalDateTime.now());
        errorBookMapper.updateById(eb);
        return eb;
    }

    @Transactional
    public void delete(Long userId, Long id) {
        ErrorBook eb = errorBookMapper.selectById(id);
        if (eb == null) {
            return;
        }
        if (!eb.getUserId().equals(userId)) {
            throw new BizException("无权删除该记录");
        }
        errorBookMapper.deleteById(id);
    }

    @Transactional
    public void clear(Long userId, String sourceType) {
        errorBookMapper.delete(new LambdaQueryWrapper<ErrorBook>()
                .eq(ErrorBook::getUserId, userId)
                .eq(sourceType != null && !sourceType.isBlank(), ErrorBook::getSourceType, sourceType));
    }
}
