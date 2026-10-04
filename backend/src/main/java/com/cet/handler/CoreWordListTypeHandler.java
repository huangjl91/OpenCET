package com.cet.handler;

import com.cet.dto.CoreWord;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

/**
 * 翻译题核心词处理器。
 *
 * <p>MyBatis-Plus 自带的 {@code JacksonTypeHandler} 读取 {@code List<CoreWord>}
 * 时因泛型擦除只能反序列化成 {@code List<LinkedHashMap>}，迭代时强转 CoreWord 会抛
 * ClassCastException。这里用 {@link TypeReference} 显式保留元素类型，
 * 同时与写入端共用同一个 ObjectMapper，保证「读 → 评分 → 写错题本」链路一致。
 */
public class CoreWordListTypeHandler extends BaseTypeHandler<List<CoreWord>> {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<List<CoreWord>> REF = new TypeReference<List<CoreWord>>() {};

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, List<CoreWord> parameter, JdbcType jdbcType)
            throws SQLException {
        ps.setString(i, parameter == null ? "[]" : write(parameter));
    }

    @Override
    public List<CoreWord> getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return parse(rs.getString(columnName));
    }

    @Override
    public List<CoreWord> getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return parse(rs.getString(columnIndex));
    }

    @Override
    public List<CoreWord> getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return parse(cs.getString(columnIndex));
    }

    private static String write(List<CoreWord> value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (Exception e) {
            return "[]";
        }
    }

    private static List<CoreWord> parse(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return MAPPER.readValue(json, REF);
        } catch (Exception e) {
            return List.of();
        }
    }
}
