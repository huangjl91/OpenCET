package com.cet.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cet.entity.WordProgress;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 单词学习进度 Mapper
 */
public interface WordProgressMapper extends BaseMapper<WordProgress> {

    @Select("SELECT * FROM word_progress WHERE user_id = #{userId} AND word_id = #{wordId} LIMIT 1")
    WordProgress selectByUserAndWord(@Param("userId") Long userId, @Param("wordId") String wordId);

    /**
     * 待复习总数
     */
    @Select("""
            SELECT COUNT(*) FROM word_progress p
            INNER JOIN word w ON w.id = p.word_id
            WHERE p.user_id = #{userId} AND w.level = #{level}
              AND p.status <> 'KNOWN' AND p.next_review_at <= #{now}
            """)
    Long countDue(@Param("userId") Long userId,
                  @Param("level") String level,
                  @Param("now") java.time.LocalDateTime now);
}
