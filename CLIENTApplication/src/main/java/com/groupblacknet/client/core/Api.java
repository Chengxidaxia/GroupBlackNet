package com.groupblacknet.client.core;

import com.groupblacknet.client.core.Model.*;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

import javax.swing.SwingUtilities;

/**
 * 后端访问层：站点 Vercel Functions（/api/discussions 只读 + /api/oauth 写入/登录）。
 * 桌面端不受浏览器 CORS 限制，但鉴权沿用同一条链路：Cookie: github_token=...
 */
public final class Api {

    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    private static final HttpClient NO_REDIRECT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(15))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    private static final ExecutorService POOL = Executors.newFixedThreadPool(6, r -> {
        Thread t = new Thread(r, "gb-net");
        t.setDaemon(true);
        return t;
    });

    private Api() {}

    /* ---------------- 异步执行 ---------------- */

    public interface ThrowingSupplier<T> { T get() throws Exception; }

    /** 后台执行，回调切回 EDT（调用方无需关心线程）。 */
    public static <T> void async(ThrowingSupplier<T> work, Consumer<T> onOk, Consumer<Exception> onErr) {
        POOL.submit(() -> {
            try {
                T v = work.get();
                if (onOk != null) SwingUtilities.invokeLater(() -> onOk.accept(v));
            } catch (Exception e) {
                if (onErr != null) SwingUtilities.invokeLater(() -> onErr.accept(e));
            }
        });
    }

    /* ---------------- 基础请求 ---------------- */

    private static HttpRequest.Builder req(String url) {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(25))
                .header("Accept", "application/json")
                .header("User-Agent", "GroupBlackNet-Client/" + Config.VERSION);
        String token = Session.token();
        if (token != null && !token.isBlank()) b.header("Cookie", "github_token=" + token);
        return b;
    }

    private static String send(HttpRequest r) throws IOException, InterruptedException {
        HttpResponse<String> res = HTTP.send(r, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (res.statusCode() >= 400) {
            String msg = res.body();
            try {
                Map<String, Object> m = Json.obj(msg);
                Object err = m.get("error");
                if (err != null) msg = String.valueOf(err);
            } catch (RuntimeException ignore) { }
            throw new IOException("HTTP " + res.statusCode() + "：" + (msg == null || msg.isBlank() ? "请求失败" : trim(msg, 200)));
        }
        return res.body();
    }

    private static String trim(String s, int n) {
        s = s.replaceAll("\\s+", " ").trim();
        return s.length() <= n ? s : s.substring(0, n) + "…";
    }

    private static String get(String url) throws IOException, InterruptedException {
        return send(req(url).GET().build());
    }

    private static String post(String url, String json) throws IOException, InterruptedException {
        return send(req(url).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8)).build());
    }

    /* ---------------- 数据（api） ---------------- */

    public static Page list(int first) throws Exception { return list(first, null); }

    public static Page list(int first, String after) throws Exception {
        String url = Config.API + "/?first=" + first + (after == null ? "" : "&after=" + enc(after));
        Map<String, Object> root = Json.obj(get(url));
        List<Post> nodes = new ArrayList<>();
        for (Object o : Json.list(root, "nodes")) nodes.add(toPost(asMap(o)));
        Map<String, Object> pi = Json.map(root, "pageInfo");
        String end = pi == null ? null : Json.str(pi, "endCursor");
        boolean hasNext = pi != null && Json.bool(pi, "hasNextPage", false);
        return new Page(nodes, end, hasNext);
    }

    /** 全量拉取（首页分页用；最多 50 页保护，与 main.js 一致）。 */
    public static List<Post> fetchAll() throws Exception {
        List<Post> acc = new ArrayList<>();
        String after = null;
        for (int guard = 0; guard < 50; guard++) {
            Page p = list(100, after);
            acc.addAll(p.nodes());
            if (!p.hasNext() || p.endCursor() == null) break;
            after = p.endCursor();
        }
        return acc;
    }

    public static Discussion discussion(int number, int cfirst, String cafter) throws Exception {
        String url = Config.API + "/?d=" + number + "&cfirst=" + cfirst
                + (cafter == null || cafter.isBlank() ? "" : "&cafter=" + enc(cafter));
        Map<String, Object> root = Json.obj(get(url));
        Map<String, Object> d = Json.map(root, "discussion");
        if (d == null) throw new IOException("文章不存在或已删除");
        Post post = toPost(d);
        List<Comment> comments = new ArrayList<>();
        Map<String, Object> cm = Json.map(d, "comments");
        int total = 0;
        String end = null;
        boolean hasNext = false;
        if (cm != null) {
            for (Object o : Json.list(cm, "nodes")) comments.add(toComment(asMap(o)));
            total = Json.intVal(cm, "totalCount", comments.size());
            Map<String, Object> pi = Json.map(cm, "pageInfo");
            if (pi != null) {
                end = Json.str(pi, "endCursor");
                hasNext = Json.bool(pi, "hasNextPage", false);
            }
        }
        return new Discussion(post, comments, Math.max(total, comments.size()), end, hasNext);
    }

    /**
     * 分类：优先站点 /api/content 的 categories.grp（Upstash 权威数据），
     * 失败再取静态快照 /assets/data/categories.json；两者都失败才抛异常，
     * 由上层继续用 MetaParser.CATS_FALLBACK 兜底。
     *
     * 说明：CF Worker 的 /categories 分支已随站点改版移除，不能再依赖。
     */
    public static List<Category> categories() throws Exception {
        List<Object> arr = fetchArray("/api/content", "grp", "/assets/data/categories.json");
        List<Category> out = new ArrayList<>();
        int i = 0;
        for (Object o : arr) {
            Map<String, Object> c = asMap(o);
            int id = Json.intVal(c, "id", i + 1);
            String name = firstNonBlank(Json.str(c, "name"), Json.str(c, "label"), String.valueOf(o));
            int hue = Json.intVal(c, "hue", (214 + i * 29) % 360);
            if (name != null && !name.isBlank()) out.add(new Category(id, name, hue));
            i++;
        }
        return out;
    }

    /** 公告：同样两级回退（/api/content 的 announcements → assets/data/announcements.json）。 */
    public static List<Announcement> announcements() throws Exception {
        List<Object> arr = fetchArray("/api/content", null, "/assets/data/announcements.json");
        List<Announcement> out = new ArrayList<>();
        for (Object o : arr) {
            if (o instanceof String s) { if (!s.isBlank()) out.add(new Announcement(s, "")); continue; }
            Map<String, Object> a = asMap(o);
            String title = firstNonBlank(Json.str(a, "title"), Json.str(a, "text"), "");
            if (title != null && !title.isBlank()) out.add(new Announcement(title, Json.str(a, "url", "")));
        }
        return out;
    }

    /**
     * 取内容数组：先站点内容接口，再站点静态 JSON。
     *
     * @param contentKey null = /api/content 里的一级数组（announcements）；
     *                   非 null = 取 categories.&lt;key&gt;（分类是分组结构）
     */
    private static List<Object> fetchArray(String contentPath, String contentKey, String staticPath) throws Exception {
        Exception last = null;

        try {
            Object v = Json.parse(get(Config.MAIN_SITE + contentPath));
            List<Object> arr = contentKey == null
                    ? asArray(v)
                    : Json.list(Json.map(asMap(v), "categories"), contentKey);
            if (!arr.isEmpty()) return arr;
        } catch (Exception e) {
            last = e;
        }

        try {
            List<Object> arr = asArray(Json.parse(get(Config.MAIN_SITE + staticPath)));
            if (!arr.isEmpty()) return arr;
        } catch (Exception e) {
            last = e;
        }

        if (last != null) throw last;
        return List.of();
    }

    @SuppressWarnings("unchecked")
    private static List<Object> asArray(Object v) {
        return v instanceof List ? (List<Object>) v : List.of();
    }

    /* ---------------- 写入 / 登录（oauth） ---------------- */

    /** 当前登录用户；未登录返回 null。 */
    public static Author me() {
        try {
            Map<String, Object> u = Json.obj(get(Config.OAUTH + "/me"));
            String login = Json.str(u, "login");
            if (login == null || login.isBlank()) return null;
            return new Author(login, Json.str(u, "avatar_url", Json.str(u, "avatarUrl", "")));
        } catch (Exception e) {
            return null;
        }
    }

    public static void logout() throws Exception { get(Config.OAUTH + "/logout"); }

    public static void react(String subjectId, String content, boolean add) throws Exception {
        post(Config.OAUTH + "/reaction",
                Json.body("subjectId", subjectId, "content", content, "action", add ? "add" : "remove"));
    }

    public static void upvote(String subjectId, boolean add) throws Exception {
        post(Config.OAUTH + "/upvote", Json.body("subjectId", subjectId, "action", add ? "add" : "remove"));
    }

    public static void comment(String discussionId, String body, String parentCommentId) throws Exception {
        String json = parentCommentId == null || parentCommentId.isBlank()
                ? Json.body("discussionId", discussionId, "body", body)
                : Json.body("discussionId", discussionId, "body", body, "parentCommentId", parentCommentId);
        post(Config.OAUTH + "/comment", json);
    }

    /** 发帖；返回新文章号（旧版 Worker 不返回时，用 /?first=1 反查兜底）。 */
    public static int createDiscussion(String title, String body) throws Exception {
        String res = post(Config.OAUTH + "/discussion", Json.body("title", title, "body", body));
        Map<String, Object> root = Json.obj(res);
        Map<String, Object> d = Json.map(root, "discussion");
        if (d != null && d.get("number") != null) return Json.intVal(d, "number", 0);
        Page p = list(1);
        if (!p.nodes().isEmpty()) return p.nodes().get(0).number();
        return 0;
    }

    /** GitHub 登录跳转（含 client_id），用于 Device Flow 与浏览器登录。 */
    public static String loginRedirect() throws Exception {
        HttpResponse<String> res = NO_REDIRECT.send(
                HttpRequest.newBuilder(URI.create(Config.OAUTH + "/login"))
                        .header("User-Agent", "GroupBlackNet-Client/" + Config.VERSION)
                        .timeout(Duration.ofSeconds(20)).GET().build(),
                HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        return res.headers().firstValue("location").orElse("");
    }

    /* ---------------- 图片上传（multipart） ---------------- */

    public static String upload(Path file) throws Exception {
        String boundary = "----GBClient" + System.nanoTime();
        byte[] bytes = Files.readAllBytes(file);
        String name = file.getFileName().toString();
        String head = "--" + boundary + "\r\n"
                + "Content-Disposition: form-data; name=\"file\"; filename=\"" + name + "\"\r\n"
                + "Content-Type: application/octet-stream\r\n\r\n";
        byte[] headB = head.getBytes(StandardCharsets.UTF_8);
        byte[] tailB = ("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8);
        byte[] all = new byte[headB.length + bytes.length + tailB.length];
        System.arraycopy(headB, 0, all, 0, headB.length);
        System.arraycopy(bytes, 0, all, headB.length, bytes.length);
        System.arraycopy(tailB, 0, all, headB.length + bytes.length, tailB.length);

        HttpRequest r = req(Config.UPLOAD + "/")
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArray(all))
                .build();
        Map<String, Object> root = Json.obj(send(r));
        Map<String, Object> data = Json.map(root, "data");
        if (data != null) {
            // 书阁 /api/imgup 的格式：{code:0, data:{url, show, th}}
            String url = Json.str(data, "url", null);
            if (url != null && !url.isBlank()) return url;
            // 兼容旧 upload Worker 的 succMap 格式
            Map<String, Object> map = Json.map(data, "succMap");
            if (map != null && !map.isEmpty()) {
                for (Object v : map.values()) return String.valueOf(v);
            }
        }
        throw new IOException("上传失败：" + firstNonBlank(
                Json.str(root, "error", null), Json.str(root, "msg", null), "未知错误"));
    }

    /* ---------------- 解析辅助 ---------------- */

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object o) {
        return o instanceof Map ? (Map<String, Object>) o : new java.util.LinkedHashMap<>();
    }

    private static String enc(String s) {
        return java.net.URLEncoder.encode(s, StandardCharsets.UTF_8);
    }

    private static String firstNonBlank(String... vals) {
        for (String v : vals) if (v != null && !v.isBlank()) return v;
        return "";
    }

    private static Author toAuthor(Map<String, Object> m) {
        Map<String, Object> a = Json.map(m, "author");
        if (a == null) return new Author("匿名", Config.DEFAULT_AVATAR);
        return new Author(Json.str(a, "login", "匿名"), Json.str(a, "avatarUrl", Config.DEFAULT_AVATAR));
    }

    private static List<Reaction> toReactions(Map<String, Object> m) {
        List<Reaction> out = new ArrayList<>();
        for (Object o : Json.list(m, "reactionGroups")) {
            Map<String, Object> g = asMap(o);
            Map<String, Object> users = Json.map(g, "users");
            int n = users == null ? 0 : Json.intVal(users, "totalCount", 0);
            out.add(new Reaction(Json.str(g, "content", ""), n, Json.bool(g, "viewerHasReacted", false)));
        }
        return out;
    }

    private static Post toPost(Map<String, Object> m) {
        String body = Json.str(m, "body", "");
        Map<String, Object> cm = Json.map(m, "comments");
        Map<String, Object> cat = Json.map(m, "category");
        return new Post(
                Json.str(m, "id", ""),
                Json.intVal(m, "number", 0),
                Json.str(m, "title", ""),
                body,
                Json.str(m, "createdAt", ""),
                Json.str(m, "updatedAt", ""),
                toAuthor(m),
                cat == null ? "" : Json.str(cat, "name", ""),
                cm == null ? 0 : Json.intVal(cm, "totalCount", 0),
                toReactions(m),
                Json.intVal(m, "upvoteCount", 0),
                Json.bool(m, "viewerHasUpvoted", false),
                MetaParser.parseFirstLine(body));
    }

    private static Comment toComment(Map<String, Object> m) {
        List<Comment> replies = new ArrayList<>();
        Map<String, Object> rp = Json.map(m, "replies");
        if (rp != null) for (Object o : Json.list(rp, "nodes")) replies.add(toComment(asMap(o)));
        return new Comment(
                Json.str(m, "id", ""),
                Json.str(m, "body", ""),
                Json.str(m, "createdAt", ""),
                Json.str(m, "updatedAt", ""),
                toAuthor(m),
                toReactions(m),
                Json.intVal(m, "upvoteCount", 0),
                Json.bool(m, "viewerHasUpvoted", false),
                replies);
    }
}
