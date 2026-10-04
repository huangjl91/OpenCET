package com.cet.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 核心词汇（翻译题解析用）
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CoreWord {

    private String en;

    private String zh;
}
