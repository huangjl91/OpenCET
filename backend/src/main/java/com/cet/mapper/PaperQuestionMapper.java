package com.cet.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cet.entity.PaperQuestion;
import org.apache.ibatis.annotations.Select;

/**
 * 真题单题 Mapper
 */
public interface PaperQuestionMapper extends BaseMapper<PaperQuestion> {

    @Select("SELECT COUNT(*) FROM paper_question WHERE paper_id = #{paperId}")
    Long countByPaper(Long paperId);

    @Select("SELECT COUNT(*) FROM paper_question WHERE paper_id = #{paperId} AND done = 1")
    Long countDoneByPaper(Long paperId);
}
