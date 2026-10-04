package com.cet.dto;

import lombok.Data;

/**
 * 单题作答 / 收藏 / 完成状态更新
 */
@Data
public class QuestionUpdateRequest {

    private String userAnswer;

    private Boolean done;

    private Boolean favorite;
}
