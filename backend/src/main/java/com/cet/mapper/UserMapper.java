package com.cet.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cet.entity.User;
import org.apache.ibatis.annotations.Select;

/**
 * 用户 Mapper
 */
public interface UserMapper extends BaseMapper<User> {

    @Select("SELECT * FROM user WHERE token = #{token} LIMIT 1")
    User selectByToken(String token);
}
