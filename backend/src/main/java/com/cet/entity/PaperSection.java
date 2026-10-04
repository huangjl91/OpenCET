package com.cet.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 真题模块（写作 / 听力 / 选词填空 / 阅读理解 / 翻译）
 */
@Data
@TableName("paper_section")
public class PaperSection {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long paperId;

    /** writing / listening / cloze / reading / translation */
    private String sectionType;

    private String title;

    /** 公共题干：听力原文、阅读文章、选词填空短文 */
    private String passage;

    private Integer orderNo;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
