package com.cet.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cet.entity.Paper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

/**
 * 真题试卷 Mapper
 */
public interface PaperMapper extends BaseMapper<Paper> {

    @Select("SELECT * FROM paper WHERE user_id = 0 ORDER BY id ASC")
    List<Paper> selectPresets();
}
