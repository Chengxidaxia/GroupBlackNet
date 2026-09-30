package com.groupblacknet.client.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 极简 JSON 解析 / 序列化。
 * 只用 JDK 实现，避免给客户端引入任何第三方依赖（保证 javac 直接可编译）。
 */
public final class Json {

    private Json() {}

    /* ---------------- 解析 ---------------- */

    public static Object parse(String text) {
        if (text == null) return null;
        Parser p = new Parser(text);
        p.ws();
        if (p.eof()) return null;
        Object v = p.value();
        return v;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> obj(String text) {
        Object v = parse(text);
        return v instanceof Map ? (Map<String, Object>) v : new LinkedHashMap<>();
    }

    private static final class Parser {
        private final String s;
        private int i;

        Parser(String s) { this.s = s; }

        boolean eof() { return i >= s.length(); }

        void ws() {
            while (i < s.length()) {
                char c = s.charAt(i);
                if (c == ' ' || c == '\n' || c == '\r' || c == '\t') i++;
                else break;
            }
        }

        Object value() {
            ws();
            if (eof()) return null;
            char c = s.charAt(i);
            switch (c) {
                case '{': return object();
                case '[': return array();
                case '"': return string();
                case 't': i += 4; return Boolean.TRUE;
                case 'f': i += 5; return Boolean.FALSE;
                case 'n': i += 4; return null;
                default: return number();
            }
        }

        Map<String, Object> object() {
            Map<String, Object> m = new LinkedHashMap<>();
            i++; // {
            ws();
            if (!eof() && s.charAt(i) == '}') { i++; return m; }
            while (!eof()) {
                ws();
                if (eof() || s.charAt(i) != '"') break;
                String k = string();
                ws();
                if (!eof() && s.charAt(i) == ':') i++;
                Object v = value();
                m.put(k, v);
                ws();
                if (!eof() && s.charAt(i) == ',') { i++; continue; }
                if (!eof() && s.charAt(i) == '}') { i++; break; }
                break;
            }
            return m;
        }

        List<Object> array() {
            List<Object> list = new ArrayList<>();
            i++; // [
            ws();
            if (!eof() && s.charAt(i) == ']') { i++; return list; }
            while (!eof()) {
                list.add(value());
                ws();
                if (!eof() && s.charAt(i) == ',') { i++; continue; }
                if (!eof() && s.charAt(i) == ']') { i++; break; }
                break;
            }
            return list;
        }

        String string() {
            StringBuilder sb = new StringBuilder();
            i++; // 起始引号
            while (i < s.length()) {
                char c = s.charAt(i++);
                if (c == '"') break;
                if (c == '\\') {
                    if (i >= s.length()) break;
                    char e = s.charAt(i++);
                    switch (e) {
                        case 'n': sb.append('\n'); break;
                        case 't': sb.append('\t'); break;
                        case 'r': sb.append('\r'); break;
                        case 'b': sb.append('\b'); break;
                        case 'f': sb.append('\f'); break;
                        case 'u':
                            if (i + 4 <= s.length()) {
                                try { sb.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); }
                                catch (NumberFormatException ignore) { }
                                i += 4;
                            }
                            break;
                        default: sb.append(e);
                    }
                } else {
                    sb.append(c);
                }
            }
            return sb.toString();
        }

        Double number() {
            int start = i;
            while (i < s.length()) {
                char c = s.charAt(i);
                if (c == '-' || c == '+' || c == '.' || (c >= '0' && c <= '9') || c == 'e' || c == 'E') i++;
                else break;
            }
            if (start == i) { i++; return null; }
            try { return Double.valueOf(s.substring(start, i)); }
            catch (NumberFormatException e) { return null; }
        }
    }

    /* ---------------- 便捷取值 ---------------- */

    public static String str(Map<String, Object> m, String key) {
        if (m == null) return null;
        Object v = m.get(key);
        return v == null ? null : String.valueOf(v);
    }

    public static String str(Map<String, Object> m, String key, String def) {
        String v = str(m, key);
        return v == null || v.isEmpty() ? def : v;
    }

    public static int intVal(Map<String, Object> m, String key, int def) {
        if (m == null) return def;
        Object v = m.get(key);
        if (v instanceof Number n) return n.intValue();
        if (v instanceof String sv) {
            try { return Integer.parseInt(sv.trim()); } catch (NumberFormatException ignore) { }
        }
        return def;
    }

    public static boolean bool(Map<String, Object> m, String key, boolean def) {
        if (m == null) return def;
        Object v = m.get(key);
        if (v instanceof Boolean b) return b;
        if (v instanceof String sv) return Boolean.parseBoolean(sv);
        return def;
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> map(Map<String, Object> m, String key) {
        if (m == null) return null;
        Object v = m.get(key);
        return v instanceof Map ? (Map<String, Object>) v : null;
    }

    @SuppressWarnings("unchecked")
    public static List<Object> list(Map<String, Object> m, String key) {
        if (m == null) return List.of();
        Object v = m.get(key);
        return v instanceof List ? (List<Object>) v : List.of();
    }

    /* ---------------- 序列化 ---------------- */

    /** 转成 JSON 字符串字面量（含两侧引号），转义完备。 */
    public static String quote(String s) {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder(s.length() + 16);
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.append('"').toString();
    }

    /** 请求体组装：{ "k": "v", "n": 3, "b": true }，值按类型自动处理。 */
    public static String body(Object... kv) {
        if (kv.length % 2 != 0) throw new IllegalArgumentException("键值必须成对");
        StringBuilder sb = new StringBuilder("{");
        for (int i = 0; i < kv.length; i += 2) {
            if (i > 0) sb.append(',');
            sb.append(quote(String.valueOf(kv[i]))).append(':');
            Object v = kv[i + 1];
            if (v == null) sb.append("null");
            else if (v instanceof Number || v instanceof Boolean) sb.append(v.toString());
            else sb.append(quote(String.valueOf(v)));
        }
        return sb.append('}').toString();
    }
}
