package com.groupblacknet.client.core;

import java.util.List;

/** 数据模型（不可变记录类）。 */
public final class Model {

    private Model() {}

    /** 分类（来自 KV categories，兜底见 MetaParser.CATS_FALLBACK） */
    public record Category(int id, String name, int hue) { }

    /** 公告（来自 KV announcements） */
    public record Announcement(String title, String url) { }

    /** 作者 */
    public record Author(String login, String avatarUrl) {
        public String name() { return login == null || login.isBlank() ? "匿名" : login; }
        public String initial() {
            String n = name();
            return n.isEmpty() ? "?" : n.substring(0, 1).toUpperCase();
        }
    }

    /** 表情反应（GitHub 枚举 content → emoji，见 MetaParser.emojiOf） */
    public record Reaction(String content, int count, boolean viewerHasReacted) { }

    /**
     * 文章首行 JSON 解析结果。
     * tpl：是否强制分类模板封面（null = 键不存在，按「有分类→模板、无分类→默认」裁定）
     */
    public record Meta(String info, String icon, String coverText, Integer category,
                       Boolean tpl, boolean allowComments, List<String> tags, String bodyText) {
        public static Meta empty(String body) {
            return new Meta(null, null, "", null, null, true, List.of(), body == null ? "" : body);
        }
    }

    /** 文章（列表项 / 详情） */
    public record Post(
            String id, int number, String title, String body,
            String createdAt, String updatedAt, Author author, String categoryName,
            int commentCount, List<Reaction> reactions, int upvoteCount, boolean viewerHasUpvoted,
            Meta meta) {

        public String titleOr() { return title == null || title.isBlank() ? "无标题" : title; }
        public String excerpt() { return meta != null && meta.info() != null ? meta.info() : ""; }
    }

    /** 评论 / 回复（replies 为嵌套一层） */
    public record Comment(
            String id, String body, String createdAt, String updatedAt, Author author,
            List<Reaction> reactions, int upvoteCount, boolean viewerHasUpvoted, List<Comment> replies) { }

    /** 详情聚合 */
    public record Discussion(
            Post post, List<Comment> comments, int commentTotal,
            String commentsEndCursor, boolean commentsHasNext) { }

    /** 列表分页结果 */
    public record Page(List<Post> nodes, String endCursor, boolean hasNext) { }
}
