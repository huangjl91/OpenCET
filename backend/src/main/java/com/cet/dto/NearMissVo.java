package com.cet.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 核心词「拼写近似」命中：译文中写成了近形词
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class NearMissVo {

    /** 期望的核心词 */
    private String expected;

    /** 译文中实际写成的词 */
    private String found;

    /** 编辑距离 */
    private Integer distance;
}
