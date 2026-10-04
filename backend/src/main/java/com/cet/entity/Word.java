package com.cet.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 词汇库词条
 */
@Data
@TableName("word")
public class Word {

    /** 词库 ID，如 cet4-001 */
    @TableId
    private String id;

    /** CET4 / CET6 */
    private String level;

    private String word;

    /** 音标 */
    private String phonetic;

    /** 词性 */
    private String pos;

    /** 中文释义 */
    private String meaning;

    private String exampleEn;

    private String exampleZh;

    /** 例句来源 */
    private String source;

    /** 词频序号，越小越高频 */
    private Integer freqRank;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
