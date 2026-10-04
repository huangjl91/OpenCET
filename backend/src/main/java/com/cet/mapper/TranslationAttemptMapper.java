package com.cet.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cet.entity.TranslationAttempt;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 翻译作答 Mapper
 */
public interface TranslationAttemptMapper extends BaseMapper<TranslationAttempt> {

    /**
     * 某题的作答记录（最新在前）
     *
     * <p>create_time 只精确到秒，同一秒内的两条记录靠时间排序是「不稳定排序」——
     * 必须补 id DESC 兜底，否则「取最新一次作答」会取错，错题本与 AI 复核复判都会跟着错。
     */
    @Select("""
            SELECT * FROM translation_attempt
            WHERE user_id = #{userId} AND question_id = #{questionId}
            ORDER BY create_time DESC, id DESC LIMIT #{limit}
            """)
    List<TranslationAttempt> selectByQuestion(@Param("userId") Long userId,
                                              @Param("questionId") String questionId,
                                              @Param("limit") int limit);

    /** 某等级的作答记录（最新在前，同样用 id DESC 兜底同秒并发） */
    @Select("""
            SELECT t.* FROM translation_attempt t
            INNER JOIN translation_question q ON q.id = t.question_id
            WHERE t.user_id = #{userId} AND q.level = #{level}
            ORDER BY t.create_time DESC, t.id DESC LIMIT #{limit}
            """)
    List<TranslationAttempt> selectByLevel(@Param("userId") Long userId,
                                           @Param("level") String level,
                                           @Param("limit") int limit);
}
