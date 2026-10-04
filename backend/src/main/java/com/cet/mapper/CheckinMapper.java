package com.cet.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cet.entity.Checkin;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDate;
import java.util.List;

/**
 * 打卡 Mapper
 */
public interface CheckinMapper extends BaseMapper<Checkin> {

    @Select("SELECT * FROM checkin WHERE user_id = #{userId} AND checkin_date = #{date} LIMIT 1")
    Checkin selectByDate(@Param("userId") Long userId, @Param("date") LocalDate date);

    @Select("SELECT * FROM checkin WHERE user_id = #{userId} ORDER BY checkin_date DESC LIMIT #{limit}")
    List<Checkin> selectRecent(@Param("userId") Long userId, @Param("limit") int limit);

    @Select("SELECT COUNT(*) FROM checkin WHERE user_id = #{userId} AND done = 1")
    Integer countDoneDays(@Param("userId") Long userId);
}
