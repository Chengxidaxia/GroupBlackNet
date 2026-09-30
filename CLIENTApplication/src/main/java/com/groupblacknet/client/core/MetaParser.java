package com.groupblacknet.client.core;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

import static com.groupblacknet.client.core.Model.*;

/**
 * 元数据解析 —— 与站点 assets/site.js 的 parseFirstLine / catIdOf / coverHTML 行为一致。
 *
 * 首行 JSON 结构：
 *   {"info":b64,"icon":b64,"coverText":"","category":3,"tpl":false,"allowComments":true,"tags":[...]}
 */
public final class MetaParser {

    private MetaParser() {}

    /* ---------------- 表情 ---------------- */

    private static final Map<String, String> EMOJI = new LinkedHashMap<>();
    static {
        EMOJI.put("THUMBS_UP", "👍");
        EMOJI.put("THUMBS_DOWN", "👎");
        EMOJI.put("LAUGH", "😄");
        EMOJI.put("HOORAY", "🎉");
        EMOJI.put("CONFUSED", "😕");
        EMOJI.put("HEART", "❤️");
        EMOJI.put("ROCKET", "🚀");
        EMOJI.put("EYES", "👀");
    }

    public static String emojiOf(String content) {
        return EMOJI.getOrDefault(content, content == null ? "" : content);
    }

    public static List<String> reactionOptions() {
        return new ArrayList<>(EMOJI.keySet());
    }

    /* ---------------- 分类 ---------------- */

    public static final List<Category> CATS_FALLBACK = List.of(
            new Category(1, "公告", 352),
            new Category(2, "资讯", 214),
            new Category(3, "技术", 168),
            new Category(4, "活动", 32),
            new Category(5, "随笔", 276));

    /** 旧数据可能是 GitHub 分类名 / 中文名 */
    private static final Map<String, Integer> LEGACY = Map.of(
            "Announcements", 1, "公告", 1, "资讯", 2, "技术", 3, "活动", 4, "随笔", 5);

    private static volatile List<Category> cats = CATS_FALLBACK;
    private static volatile boolean catsRemote = false;

    public static List<Category> cats() { return cats; }
    public static boolean catsFromRemote() { return catsRemote; }

    public static void setCats(List<Category> list) {
        if (list != null && !list.isEmpty()) {
            cats = List.copyOf(list);
            catsRemote = true;
        }
    }

    public static Category catInfo(int id) {
        for (Category c : cats) if (c.id() == id) return c;
        return new Category(id, id == 0 ? "群档案" : "随笔", 214);
    }

    public static Category catInfo(int id, String fallbackName) {
        for (Category c : cats) if (c.id() == id) return c;
        return new Category(id, fallbackName == null || fallbackName.isBlank() ? "随笔" : fallbackName, 214);
    }

    /** 从文章（含首行 JSON）推断分类数字 ID；General / 未分类 → 0 */
    public static int catIdOf(Post p) {
        Meta m = p == null ? null : p.meta();
        if (m != null && m.category() != null) {
            Integer id = m.category();
            if (id > 0) return id;
        }
        String nm = p == null || p.categoryName() == null ? "" : p.categoryName();
        if (GENERAL.matcher(nm).matches()) return 0;
        return LEGACY.getOrDefault(nm, 0);
    }

    /** General 分类不展示（站点约定） */
    private static final Pattern GENERAL = Pattern.compile("^general$", Pattern.CASE_INSENSITIVE);

    public static boolean isGeneral(int catId, String catName) {
        return catId == 0 || catName == null || GENERAL.matcher(catName).matches();
    }

    public static boolean isAnnouncement(Post p) {
        if (catIdOf(p) == 1) return true;
        String nm = p == null || p.categoryName() == null ? "" : p.categoryName();
        return "Announcements".equals(nm);
    }

    /** 封面占位文字：未分类用站名，而不是 General */
    public static String coverLabel(int catId) {
        return catId == 0 ? Config.APP_NAME : catInfo(catId).name();
    }

    /* ---------------- 首行 JSON ---------------- */

    public static Meta parseFirstLine(String body) {
        String src = body == null ? "" : body;
        int nl = src.indexOf('\n');
        String first = (nl < 0 ? src : src.substring(0, nl)).trim();
        String rest = nl < 0 ? "" : src.substring(nl + 1).trim();
        if (first.isEmpty() || first.charAt(0) != '{') {
            return new Meta(first.isEmpty() ? null : first, null, "", null, null, true, List.of(), rest);
        }
        try {
            Map<String, Object> d = Json.obj(first);
            if (d.isEmpty()) return new Meta(first, null, "", null, null, true, List.of(), rest);
            String info = b64d(Json.str(d, "info"));
            String icon = b64d(Json.str(d, "icon"));
            String coverText = Json.str(d, "coverText", "");
            Integer category = d.get("category") == null ? null : Json.intVal(d, "category", 0);
            Boolean tpl = d.get("tpl") instanceof Boolean b ? b : null;
            boolean allowComments = !Boolean.FALSE.equals(d.get("allowComments"));
            List<String> tags = new ArrayList<>();
            for (Object t : Json.list(d, "tags")) {
                if (t != null && !String.valueOf(t).isBlank()) tags.add(String.valueOf(t));
            }
            return new Meta(info, icon, coverText, category, tpl, allowComments, tags, rest);
        } catch (RuntimeException e) {
            return new Meta(first, null, "", null, null, true, List.of(), rest);
        }
    }

    /* ---------------- base64 ---------------- */

    public static String b64d(String s) {
        if (s == null || s.isEmpty()) return null;
        try {
            return new String(Base64.getDecoder().decode(s), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            try { return new String(Base64.getMimeDecoder().decode(s), StandardCharsets.UTF_8); }
            catch (IllegalArgumentException e2) { return null; }
        }
    }

    public static String b64e(String s) {
        if (s == null) s = "";
        return Base64.getEncoder().encodeToString(s.getBytes(StandardCharsets.UTF_8));
    }

    /* ---------------- 封面裁定（对齐 site.js coverHTML） ---------------- */

    /**
     * 是否使用分类模板封面：
     *   1) tpl=true  → 模板
     *   2) tpl=false → 自定义（icon > coverText > 渐变兜底）
     *   3) 无 tpl 键 → 有分类 → 模板；无分类 → 默认封面
     */
    public static boolean useTemplateCover(Meta m, int catId) {
        if (m != null && m.tpl() != null) return m.tpl();
        return catId != 0;
    }

    /* ---------------- 计数 / 时间 ---------------- */

    public static List<Reaction> meaningfulReactions(List<Reaction> groups) {
        List<Reaction> out = new ArrayList<>();
        if (groups == null) return out;
        for (Reaction r : groups) if (r.count() > 0) out.add(r);
        return out;
    }

    public static int totalReactions(List<Reaction> groups) {
        int n = 0;
        if (groups != null) for (Reaction r : groups) n += Math.max(0, r.count());
        return n;
    }

    public static int upCount(Post p) {
        if (p == null) return 0;
        if (p.upvoteCount() > 0) return p.upvoteCount();
        for (Reaction r : p.reactions()) if ("THUMBS_UP".equals(r.content())) return r.count();
        return 0;
    }

    private static final DateTimeFormatter F_FULL =
            DateTimeFormatter.ofPattern("yyyy年M月d日 HH:mm", Locale.CHINA);
    private static final DateTimeFormatter F_MD =
            DateTimeFormatter.ofPattern("M月d日", Locale.CHINA);

    public static String fmtShort(String iso) {
        OffsetDateTime t = parseIso(iso);
        if (t == null) return "";
        OffsetDateTime now = OffsetDateTime.now();
        return t.getYear() == now.getYear()
                ? t.format(F_MD)
                : t.getYear() + "年" + t.format(F_MD);
    }

    public static String fmtFull(String iso) {
        OffsetDateTime t = parseIso(iso);
        return t == null ? "" : t.format(F_FULL);
    }

    private static OffsetDateTime parseIso(String iso) {
        if (iso == null || iso.isBlank()) return null;
        try { return OffsetDateTime.parse(iso); }
        catch (RuntimeException e) {
            try { return OffsetDateTime.parse(iso.replace("Z", "+00:00")); }
            catch (RuntimeException e2) { return null; }
        }
    }
}
