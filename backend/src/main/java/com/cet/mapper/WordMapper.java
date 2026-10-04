package com.cet.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cet.entity.Word;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 词汇 Mapper
 */
public interface WordMapper extends BaseMapper<Word> {

    /**
     * 按等级取词库（按词频升序）
     */
    @Select("SELECT * FROM word WHERE level = #{level} ORDER BY freq_rank ASC")
    List<Word> selectByLevel(@Param("level") String level);

    /**
     * 待学新词：本等级中尚未建立学习进度的词
     */
    @Select("""
            SELECT w.* FROM word w
            WHERE w.level = #{level}
              AND NOT EXISTS (
                SELECT 1 FROM word_progress p
                WHERE p.user_id = #{userId} AND p.word_id = w.id
              )
            ORDER BY w.freq_rank ASC
            LIMIT #{limit}
            """)
    List<Word> selectNewWords(@Param("userId") Long userId,
                              @Param("level") String level,
                              @Param("limit") int limit);

    /**
     * 到期复习词：按遗忘曲线 next_review_at 已到期
     */
    @Select("""
            SELECT w.* FROM word w
            INNER JOIN word_progress p ON p.word_id = w.id
            WHERE p.user_id = #{userId}
              AND w.level = #{level}
              AND p.status <> 'KNOWN'
              AND p.next_review_at <= #{now}
            ORDER BY p.next_review_at ASC
            LIMIT #{limit}
            """)
    List<Word> selectDueWords(@Param("userId") Long userId,
                              @Param("level") String level,
                              @Param("now") java.time.LocalDateTime now,
                              @Param("limit") int limit);

    /**
     * 生词本
     */
    @Select("""
            SELECT w.* FROM word w
            INNER JOIN word_progress p ON p.word_id = w.id
            WHERE p.user_id = #{userId} AND p.in_notebook = 1
            ORDER BY p.update_time DESC
            """)
    List<Word> selectNotebook(@Param("userId") Long userId);

    /**
     * 按状态取词（已掌握 / 学习中）
     */
    @Select("""
            SELECT w.* FROM word w
            INNER JOIN word_progress p ON p.word_id = w.id
            WHERE p.user_id = #{userId} AND w.level = #{level} AND p.status = #{status}
            ORDER BY p.update_time DESC
            """)
    List<Word> selectByStatus(@Param("userId") Long userId,
                              @Param("level") String level,
                              @Param("status") String status);
}
