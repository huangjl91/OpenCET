package com.cet.common;

import com.cet.dto.CoreWord;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 翻译自动批改引擎（纯本地启发式，不依赖外部服务）
 *
 * <p>评分构成（合计 100）：
 * <ul>
 *   <li>核心词覆盖 55 分 —— 命中满分，拼写近似 / 语序存疑记半分</li>
 *   <li>篇幅贴合 30 分 —— 与参考译文词数比对，<b>过长罚分更重</b>（抑制灌水冗余）</li>
 *   <li>语言规范 15 分 —— 句首大写、句末标点、连续重复词、拼写疑似错误</li>
 * </ul>
 *
 * <p>相对早期版本的三处能力增强：
 * <ol>
 *   <li>词形还原接入<b>不规则变化表</b>（go/went/gone、child/children、good/better/best …），
 *       不再只做 s/ed/ing 截断；</li>
 *   <li>词组匹配加入<b>位置跨度约束</b>，核心词散落在全文各处（语序/搭配错乱）不再算满分命中；</li>
 *   <li>引入<b>编辑距离</b>做拼写近似识别，拼错的词记半分并提示正确拼写，不再"一错全丢"。</li>
 * </ol>
 */
public final class TranslationGrader {

    private TranslationGrader() {
    }

    public static final int W_CORE = 55;
    public static final int W_LENGTH = 30;
    public static final int W_LANGUAGE = 15;

    /** 过长译文相对过短译文的罚分倍率（灌水比漏译更该扣） */
    private static final double OVER_LENGTH_FACTOR = 1.25;

    /** 词组匹配允许的位置跨度余量：词组词数 + 该余量以内视为语序正常 */
    private static final int SPAN_SLACK = 2;

    /** 拼写近似判定的最大编辑距离 */
    private static final int MAX_SPELL_DISTANCE = 2;

    /** 冗余判定的绝对下限：低于此比例一律不罚（短句里重复一次很正常） */
    private static final double REDUNDANCY_FLOOR = 0.20;

    /** 冗余判定的相对余量：比参考译文自身重复率高出这么多，才算「学生自己灌水」 */
    private static final double REDUNDANCY_MARGIN = 0.10;

    /** 可缺省虚词：冠词允许省略或换用（exert an influence on ↔ exert a great influence on） */
    private static final Set<String> OPTIONAL_TOKENS = Set.of("a", "an", "the");

    /** 所有格限定词 */
    private static final Set<String> POSSESSIVES = Set.of(
            "my", "your", "his", "her", "its", "our", "their", "one", "ones");

    /**
     * 计算跨度时不计入的「填充词」：冠词与所有格。
     *
     * <p>它们是名词短语的附属成分，学生写 followed his teacher's advice 不该因为插了个所有格
     * 就被判成语序问题。
     */
    private static boolean isFiller(String t) {
        return OPTIONAL_TOKENS.contains(t) || POSSESSIVES.contains(t)
                || t.endsWith("'s") || t.endsWith("'");
    }

    private static final Set<String> STOPWORDS = Set.of(
            "a", "an", "the", "of", "in", "on", "at", "to", "for", "with", "and", "or", "but",
            "is", "are", "was", "were", "be", "been", "being", "as", "by", "from", "that", "this",
            "these", "those", "it", "its", "they", "them", "their", "we", "our", "you", "your",
            "he", "she", "his", "her", "has", "have", "had", "do", "does", "did", "will", "would",
            "can", "could", "should", "may", "might", "must", "not", "no", "so", "than", "then",
            "there", "here", "also", "very", "more", "most", "much", "many", "some", "any", "all",
            "both", "each", "other", "such", "into", "over", "under", "about", "up", "down", "out",
            "off", "during", "between", "while", "when", "where", "which", "who", "whom", "what"
    );

    /* -------------------------------------------------- 结果模型 -------------------------------------------------- */

    /** 单条核心词的匹配结果 */
    public enum Kind {HIT, REORDER, NEAR, MISS}

    public record NearMiss(String expected, String found, int distance) {
    }

    public record Match(Kind kind, String found, int distance) {
    }

    /**
     * 批改结果
     *
     * @param score          总分 0-100
     * @param coreScore      核心词得分（满分 55）
     * @param lengthScore    篇幅贴合得分（满分 30）
     * @param languageScore  语言规范得分（满分 15）
     * @param coreRate       核心词覆盖率 0-1（含近似与语序折半）
     * @param lengthFit      篇幅贴合度 0-1
     * @param redundancy     冗余度 0-1（重复内容词占比）
     * @param hit            完全命中
     * @param reorder        词都在但位置跨度异常（语序/搭配存疑）
     * @param near           拼写近似
     * @param miss           完全未出现
     * @param languageIssues 语言规范预警
     * @param spellingIssues 疑似拼写错误
     * @param repeatedWords  高频重复词（附次数）
     */
    public record Result(
            int score,
            int coreScore,
            int lengthScore,
            int languageScore,
            double coreRate,
            double lengthFit,
            double redundancy,
            List<String> hit,
            List<String> reorder,
            List<NearMiss> near,
            List<String> miss,
            List<String> languageIssues,
            List<String> spellingIssues,
            List<String> repeatedWords
    ) {
    }

    /* -------------------------------------------------- 主入口 -------------------------------------------------- */

    public static Result grade(String answer, String reference, List<CoreWord> coreWords) {
        String ans = answer == null ? "" : answer.trim();
        String ref = reference == null ? "" : reference.trim();
        List<String> ansTokens = tokens(ans);
        List<String> refTokens = tokens(ref);
        List<CoreWord> cores = coreWords == null ? List.of() : coreWords;

        List<String> hit = new ArrayList<>();
        List<String> reorder = new ArrayList<>();
        List<NearMiss> near = new ArrayList<>();
        List<String> miss = new ArrayList<>();

        double gained = 0.0;
        for (CoreWord cw : cores) {
            Match m = matchCore(ansTokens, cw.getEn());
            switch (m.kind()) {
                case HIT -> {
                    hit.add(cw.getEn());
                    gained += 1.0;
                }
                case REORDER -> {
                    reorder.add(cw.getEn());
                    gained += 0.5;
                }
                case NEAR -> {
                    near.add(new NearMiss(cw.getEn(), m.found(), m.distance()));
                    gained += 0.5;
                }
                default -> miss.add(cw.getEn());
            }
        }

        double coreRate = cores.isEmpty() ? 1.0 : gained / cores.size();
        int coreScore = (int) Math.round(coreRate * W_CORE);

        double lengthFit = lengthFit(ansTokens.size(), refTokens.size());
        int lengthScore = (int) Math.round(lengthFit * W_LENGTH);

        List<String> spellingIssues = detectSpelling(ansTokens, refTokens);
        List<String> repeatedWords = repeatedContentWords(ansTokens);
        double redundancy = redundancyRatio(ansTokens);
        double refRedundancy = redundancyRatio(refTokens);

        LanguageOutcome lang = checkLanguage(ans, spellingIssues, redundancy, refRedundancy);
        int languageScore = lang.score;

        int score = Math.max(0, Math.min(100, coreScore + lengthScore + languageScore));

        return new Result(score, coreScore, lengthScore, languageScore, round3(coreRate), round3(lengthFit),
                round3(redundancy), hit, reorder, near, miss, lang.issues, spellingIssues, repeatedWords);
    }

    /* -------------------------------------------------- 核心词匹配 -------------------------------------------------- */

    private static Match matchCore(List<String> ansTokens, String phrase) {
        List<String> pTokens = tokens(cleanCorePhrase(phrase));
        if (pTokens.isEmpty()) {
            return new Match(Kind.MISS, null, 0);
        }

        /*
         * 冠词不参与「必需匹配」。原因有二：
         *   1. 学生换用/省略冠词（exert an influence on ↔ exert a great influence on）不该判错；
         *   2. 冠词是全文最高频的词，一旦纳入匹配，会锚到段落另一端（an influence 的 an 匹配到
         *      are an outstanding 的 an），跨度瞬间爆炸、被误判成语序问题。
         * 冠词在「跨度」统计里仍按填充词排除，所以窗口里多出来的冠词不会被罚。
         */
        List<String> need = new ArrayList<>();
        for (String t : pTokens) {
            if (!OPTIONAL_TOKENS.contains(t)) {
                need.add(t);
            }
        }
        if (need.isEmpty()) {
            need = pTokens;
        }

        /*
         * 在所有可能的起点里挑「最紧凑」的匹配窗口。
         * 核心词里常含 the / of / on / to 这类高频词，若从句子开头贪心匹配，会锚定到错误位置、
         * 把跨度算得虚高，从而被误判成语序问题（例如 on the other hand 会锚到句首的 on the）。
         */
        Integer bestSpan = null;
        boolean bestBacksweep = false;
        for (int start = 0; start < ansTokens.size(); start++) {
            if (!sameWord(ansTokens.get(start), need.get(0))) {
                continue;
            }
            boolean[] used = new boolean[ansTokens.size()];
            used[start] = true;
            List<Integer> positions = new ArrayList<>();
            positions.add(start);
            // 需要「回头找」说明词组在译文中顺序被破坏，是语序问题的直接信号
            boolean backsweep = false;
            boolean ok = true;
            int cursor = start + 1;

            for (int k = 1; k < need.size(); k++) {
                int pos = findWord(ansTokens, need.get(k), used, cursor);
                if (pos < 0) {
                    pos = findWord(ansTokens, need.get(k), used, 0); // 允许乱序：回头再找一次
                    if (pos >= 0) {
                        backsweep = true;
                    }
                }
                if (pos < 0) {
                    ok = false;
                    break;
                }
                used[pos] = true;
                positions.add(pos);
                cursor = pos + 1;
            }
            if (!ok) {
                continue;
            }

            int lo = positions.stream().min(Comparator.naturalOrder()).orElse(0);
            int hi = positions.stream().max(Comparator.naturalOrder()).orElse(0);
            // 跨度只数「实词」，冠词与所有格不计入
            int span = 0;
            for (int i = lo; i <= hi; i++) {
                if (!isFiller(ansTokens.get(i))) {
                    span++;
                }
            }
            if (bestSpan == null
                    || (bestBacksweep && !backsweep)
                    || (bestBacksweep == backsweep && span < bestSpan)) {
                bestSpan = span;
                bestBacksweep = backsweep;
            }
        }

        // 顺序被破坏，或各词散落跨度过大 → 语序 / 搭配大概率不对，折半计分
        if (bestSpan != null) {
            return new Match(!bestBacksweep && bestSpan <= need.size() + SPAN_SLACK ? Kind.HIT : Kind.REORDER, null, 0);
        }

        // 单词型核心词：尝试拼写近似
        if (pTokens.size() == 1) {
            String target = pTokens.get(0);
            String best = null;
            int bestD = Integer.MAX_VALUE;
            for (String t : new LinkedHashSet<>(ansTokens)) {
                if (t.length() < 4 || target.length() < 4) {
                    continue;
                }
                if (Math.abs(t.length() - target.length()) > MAX_SPELL_DISTANCE) {
                    continue;
                }
                if (t.charAt(0) != target.charAt(0)) {
                    continue;
                }
                int d = distance(t, target);
                if (d < bestD) {
                    bestD = d;
                    best = t;
                }
            }
            if (best != null && bestD <= MAX_SPELL_DISTANCE && bestD > 0
                    && Math.max(best.length(), target.length()) >= 5) {
                return new Match(Kind.NEAR, best, bestD);
            }
        }
        return new Match(Kind.MISS, null, 0);
    }

    /**
     * 清洗核心词里的「占位符」与「可缺省虚词」，让它们能被真实译文匹配。
     *
     * <p>题库里大量核心词是按语法结构书写的模板式短语，例如 {@code prefer A to B}、
     * {@code enable sb. to do}、{@code with one's own eyes}、{@code be regarded as}、
     * {@code artificial intelligence (AI)}、{@code given (that)}。这类字符串按字面永远匹配不上
     * 任何译文，学生即使译对也拿不到分。清洗后只保留实词骨架，语义不变但可以被正常命中。
     *
     * <p>另外两处只在词首处理：
     * <ul>
     *   <li>去掉起首的 {@code be}（be set against → set against，译文里 Set against… 并没有 be）；</li>
     *   <li>去掉起首的冠词（题目写 a variety of，学生写 varieties of 不该判未命中）。</li>
     * </ul>
     * 位于词组中间的冠词不在这里删，而是在 {@link #matchCore} 里按「可缺省」处理，
     * 这样不会把 {@code exert an influence on} 缩成两个词、反而把语义骨架削掉。
     */
    public static String cleanCorePhrase(String raw) {
        String s = raw == null ? "" : raw.replaceAll("[’‘`´]", "'");
        s = s.replaceAll("\\([^)]*\\)", " ");        // (AI) / (that)
        s = s.replaceAll("(?i)\\bsb\\.?'?s\\b", " "); // sb's / sb.
        s = s.replaceAll("(?i)\\bsb\\b\\.?", " ");
        s = s.replaceAll("(?i)\\bsth\\b\\.?", " ");
        s = s.replaceAll("(?i)\\bone'?s\\b", " ");   // one's
        s = s.replaceAll("(?i)\\bto\\s+do\\b", "to"); // enable sb. to do → enable to
        s = s.replaceAll("(?i)\\bdo\\b\\s*$", "");   // 末尾孤立的 do
        s = s.replaceAll("(^|\\s)[A-Z](\\s|$)", " "); // 占位字母 A / B
        s = s.replaceAll("(?i)^\\s*be\\s+", "");      // be set against → set against
        s = s.replaceAll("(?i)^\\s*(?:a|an|the)\\s+", ""); // a variety of → variety of
        String cleaned = s.replaceAll("\\s+", " ").trim();
        // 兜底：若清洗后什么都不剩（极端模板词），保留原串，避免出现「必然未命中」的空词组
        return cleaned.isEmpty()
                ? (raw == null ? "" : raw.replaceAll("[’‘`´]", "'").replaceAll("\\s+", " ").trim())
                : cleaned;
    }

    private static int findWord(List<String> tokens, String target, boolean[] used, int from) {
        for (int i = Math.max(0, from); i < tokens.size(); i++) {
            if (!used[i] && sameWord(tokens.get(i), target)) {
                return i;
            }
        }
        return -1;
    }

    /**
     * 同词判定（考虑词形变化）
     *
     * <p>只比 {@link #stem} 会漏掉一类高频情况：原词以 e 结尾时，`-ed/-ing` 变形会被还原成
     * 去掉 e 的词干（improve → improved → improv），与原词对不上。这里补一个「词干 + e」
     * 候选，把 improved / improving / improves 都拉回 improve。
     */
    private static boolean sameWord(String a, String b) {
        if (a.equals(b)) {
            return true;
        }
        return !Collections.disjoint(variants(a), variants(b));
    }

    private static Set<String> variants(String w) {
        String s = w.toLowerCase(Locale.ROOT);
        String st = stem(s);
        // 注意：s 与 st 常常相同（the / and 之类），不能用 Set.of(...)（重复元素会抛异常）
        Set<String> out = new HashSet<>(4);
        out.add(s);
        out.add(st);
        out.add(st + "e");
        // -ied 结尾：unified → unifi → unify、studied → studi → study
        if (st.endsWith("i")) {
            out.add(st.substring(0, st.length() - 1) + "y");
        }
        return out;
    }

    /* -------------------------------------------------- 篇幅贴合（不对称） -------------------------------------------------- */

    private static double lengthFit(int answerWords, int referenceWords) {
        if (answerWords == 0) {
            return 0.0;
        }
        if (referenceWords == 0) {
            return 1.0;
        }
        double diff = Math.abs(answerWords - referenceWords) / (double) referenceWords;
        diff = Math.min(1.0, diff);
        double penalty = answerWords > referenceWords ? diff * OVER_LENGTH_FACTOR : diff;
        return Math.max(0.0, 1.0 - penalty);
    }

    /* -------------------------------------------------- 拼写疑似（对照参考译文） -------------------------------------------------- */

    private static List<String> detectSpelling(List<String> ansTokens, List<String> refTokens) {
        if (ansTokens.isEmpty() || refTokens.isEmpty()) {
            return List.of();
        }
        Set<String> refStems = new HashSet<>();
        for (String r : refTokens) {
            refStems.add(stem(r));
        }
        List<String> issues = new ArrayList<>();
        Set<String> handled = new HashSet<>();

        for (String t : new LinkedHashSet<>(ansTokens)) {
            if (t.length() < 5 || STOPWORDS.contains(t) || handled.contains(t)) {
                continue;
            }
            if (refStems.contains(stem(t))) {
                continue; // 本来就是参考译文里的词（或其变形），不是拼写错误
            }
            String best = null;
            int bestD = Integer.MAX_VALUE;
            for (String r : new LinkedHashSet<>(refTokens)) {
                if (r.length() < 4 || STOPWORDS.contains(r)) {
                    continue;
                }
                if (Math.abs(r.length() - t.length()) > MAX_SPELL_DISTANCE) {
                    continue;
                }
                if (r.charAt(0) != t.charAt(0)) {
                    continue;
                }
                int d = distance(t, r);
                if (d < bestD) {
                    bestD = d;
                    best = r;
                }
            }
            if (best != null && bestD <= MAX_SPELL_DISTANCE && bestD > 0) {
                handled.add(t);
                issues.add("「" + t + "」疑为「" + best + "」拼写有误");
            }
        }
        return issues;
    }

    /* -------------------------------------------------- 冗余 -------------------------------------------------- */

    private static List<String> repeatedContentWords(List<String> ansTokens) {
        Map<String, Integer> freq = new LinkedHashMap<>();
        for (String t : ansTokens) {
            if (t.length() < 4 || STOPWORDS.contains(t)) {
                continue;
            }
            freq.merge(stem(t), 1, Integer::sum);
        }
        int threshold = ansTokens.size() > 60 ? 3 : 2;
        List<String> out = new ArrayList<>();
        freq.forEach((w, c) -> {
            if (c >= threshold) {
                out.add(w + "×" + c);
            }
        });
        return out;
    }

    private static double redundancyRatio(List<String> ansTokens) {
        List<String> content = ansTokens.stream()
                .filter(t -> t.length() >= 4 && !STOPWORDS.contains(t))
                .map(TranslationGrader::stem)
                .toList();
        if (content.isEmpty()) {
            return 0.0;
        }
        Map<String, Integer> freq = new LinkedHashMap<>();
        content.forEach(t -> freq.merge(t, 1, Integer::sum));
        int extra = freq.values().stream().mapToInt(c -> Math.max(0, c - 1)).sum();
        return Math.min(1.0, extra / (double) content.size());
    }

    /* -------------------------------------------------- 语言规范 -------------------------------------------------- */

    private record LanguageOutcome(int score, List<String> issues) {
    }

    private static LanguageOutcome checkLanguage(String ans, List<String> spellingIssues,
                                                 double redundancy, double refRedundancy) {
        int score = W_LANGUAGE;
        List<String> issues = new ArrayList<>();
        if (ans.isEmpty()) {
            return new LanguageOutcome(0, issues);
        }

        char first = 0;
        for (int i = 0; i < ans.length(); i++) {
            char c = ans.charAt(i);
            if (Character.isLetter(c)) {
                first = c;
                break;
            }
        }
        if (first != 0 && Character.isLowerCase(first)) {
            score -= 3;
            issues.add("句首单词未大写");
        }

        char last = ans.charAt(ans.length() - 1);
        if (last != '.' && last != '!' && last != '?') {
            score -= 3;
            issues.add("句末缺少终止标点（. ? !）");
        }

        /*
         * 连续重复词只看「原文里紧挨着的同一个词」，不能拿分词结果比 ——
         * 分词会抹掉标点，于是 "the past decade and more, more than 150 countries"
         * 这种完全正确的英文会被当成 "more more" 重复。用带空白的正则才准。
         */
        int dupRuns = countConsecutiveDuplicates(ans);
        if (dupRuns > 0) {
            score -= Math.min(6, dupRuns * 2);
            issues.add("存在连续重复词 " + dupRuns + " 处");
        }

        /*
         * 冗余是「相对」概念：介绍高铁、丝绸之路、汉字这类段落，参考译文本身就会反复出现
         * high-speed / silk / Chinese 等词，这是原文决定的，不该算学生用词单调。
         * 因此只有在「超过绝对下限」且「明显高于参考译文自身重复率」时才扣分，
         * 这样既能放过正常段落，又能抓住真正靠重复凑字数的灌水译文。
         */
        if (redundancy > REDUNDANCY_FLOOR && redundancy - refRedundancy > REDUNDANCY_MARGIN) {
            score -= 4;
            issues.add("内容词重复率偏高（" + Math.round(redundancy * 100) + "%），注意用词多样性");
        }

        if (!spellingIssues.isEmpty()) {
            score -= Math.min(4, spellingIssues.size() * 2);
            issues.add("疑似拼写错误 " + spellingIssues.size() + " 处");
        }

        return new LanguageOutcome(Math.max(0, score), issues);
    }

    /** 统计原文里「同一个词（≥3 字母）被空白直接隔开、连续出现」的次数 */
    private static int countConsecutiveDuplicates(String ans) {
        Matcher m = CONSECUTIVE_DUP.matcher(ans);
        int n = 0;
        while (m.find()) {
            n++;
        }
        return n;
    }

    private static final Pattern CONSECUTIVE_DUP =
            Pattern.compile("\\b([A-Za-z]{3,})\\s+\\1\\b", Pattern.CASE_INSENSITIVE);

    /* -------------------------------------------------- 词形还原 -------------------------------------------------- */

    /** 不规则变化表（动词过去式/过去分词/三单、名词不规则复数、形容词副词比较级） */
    private static Map<String, String> buildIrregular() {
        Map<String, String> m = new LinkedHashMap<>();
        String[][] pairs = {
                // --- 动词 ---
                {"went", "go"}, {"gone", "go"}, {"goes", "go"}, {"did", "do"}, {"done", "do"}, {"does", "do"},
                {"had", "have"}, {"has", "have"}, {"was", "be"}, {"were", "be"}, {"been", "be"}, {"is", "be"},
                {"are", "be"}, {"am", "be"}, {"made", "make"}, {"took", "take"}, {"taken", "take"},
                {"came", "come"}, {"got", "get"}, {"gotten", "get"}, {"gave", "give"}, {"given", "give"},
                {"saw", "see"}, {"seen", "see"}, {"said", "say"}, {"found", "find"}, {"thought", "think"},
                {"told", "tell"}, {"became", "become"}, {"shown", "show"}, {"left", "leave"},
                {"felt", "feel"}, {"brought", "bring"}, {"began", "begin"}, {"begun", "begin"},
                {"kept", "keep"}, {"held", "hold"}, {"wrote", "write"}, {"written", "write"},
                {"stood", "stand"}, {"heard", "hear"}, {"meant", "mean"}, {"met", "meet"},
                {"ran", "run"}, {"paid", "pay"}, {"sat", "sit"}, {"spoke", "speak"}, {"spoken", "speak"},
                {"led", "lead"}, {"grew", "grow"}, {"grown", "grow"}, {"lost", "lose"}, {"fell", "fall"},
                {"fallen", "fall"}, {"sent", "send"}, {"built", "build"}, {"understood", "understand"},
                {"drew", "draw"}, {"drawn", "draw"}, {"broke", "break"}, {"broken", "break"},
                {"spent", "spend"}, {"rose", "rise"}, {"risen", "rise"}, {"drove", "drive"},
                {"driven", "drive"}, {"bought", "buy"}, {"wore", "wear"}, {"worn", "wear"},
                {"chose", "choose"}, {"chosen", "choose"}, {"ate", "eat"}, {"eaten", "eat"}, {"won", "win"},
                {"flew", "fly"}, {"flown", "fly"}, {"sold", "sell"}, {"sang", "sing"}, {"sung", "sing"},
                {"taught", "teach"}, {"caught", "catch"}, {"threw", "throw"}, {"thrown", "throw"},
                {"slept", "sleep"}, {"swam", "swim"}, {"swum", "swim"}, {"drank", "drink"}, {"drunk", "drink"},
                {"lay", "lie"}, {"lain", "lie"}, {"shook", "shake"}, {"shaken", "shake"},
                {"rode", "ride"}, {"ridden", "ride"}, {"hid", "hide"}, {"hidden", "hide"},
                {"blew", "blow"}, {"blown", "blow"}, {"froze", "freeze"}, {"frozen", "freeze"},
                {"sought", "seek"}, {"fought", "fight"}, {"struck", "strike"}, {"hung", "hang"},
                {"dug", "dig"}, {"bent", "bend"}, {"dealt", "deal"}, {"swept", "sweep"},
                {"woven", "weave"}, {"wove", "weave"}, {"weaving", "weave"}, {"weaves", "weave"},
                // --- 名词不规则复数 ---
                {"children", "child"}, {"feet", "foot"}, {"teeth", "tooth"}, {"men", "man"},
                {"women", "woman"}, {"mice", "mouse"}, {"geese", "goose"}, {"oxen", "ox"},
                {"criteria", "criterion"}, {"phenomena", "phenomenon"}, {"analyses", "analysis"},
                {"crises", "crisis"}, {"theses", "thesis"}, {"bases", "basis"}, {"hypotheses", "hypothesis"},
                {"lives", "life"}, {"wives", "wife"}, {"knives", "knife"}, {"leaves", "leaf"},
                {"halves", "half"}, {"selves", "self"}, {"shelves", "shelf"}, {"wolves", "wolf"},
                {"thieves", "thief"}, {"media", "medium"}, {"curricula", "curriculum"}, {"stimuli", "stimulus"},
                {"nuclei", "nucleus"}, {"fungi", "fungus"}, {"alumni", "alumnus"}, {"cacti", "cactus"},
                // --- 比较级 / 最高级 / 副词 ---
                {"better", "good"}, {"best", "good"}, {"worse", "bad"}, {"worst", "bad"},
                {"further", "far"}, {"furthest", "far"}, {"farther", "far"}, {"farthest", "far"},
                {"less", "little"}, {"least", "little"},
        };
        for (String[] p : pairs) {
            m.put(p[0], p[1]);
        }
        return Map.copyOf(m);
    }

    private static final Map<String, String> IRREGULAR = buildIrregular();

    /** 简化词形还原：先查不规则表，再做常见后缀截断 */
    public static String stem(String w) {
        String s = w.toLowerCase(Locale.ROOT);
        String irr = IRREGULAR.get(s);
        if (irr != null) {
            return irr;
        }
        for (String suffix : List.of("ies", "ing", "ed", "es", "s")) {
            if (s.length() > suffix.length() + 2 && s.endsWith(suffix)) {
                if ("ies".equals(suffix)) {
                    return s.substring(0, s.length() - 3) + "y";
                }
                String base = s.substring(0, s.length() - suffix.length());
                // 处理双写辅音（running → run、stopped → stop）
                if (base.length() > 2) {
                    char c1 = base.charAt(base.length() - 1);
                    char c2 = base.charAt(base.length() - 2);
                    if (c1 == c2 && "bdgklmnprt".indexOf(c1) >= 0) {
                        base = base.substring(0, base.length() - 1);
                    }
                }
                return base;
            }
        }
        return s;
    }

    /* -------------------------------------------------- 文本工具 -------------------------------------------------- */

    public static String normalize(String s) {
        return s
                // 弯引号统一成直引号：题库里 one’s / teacher’s 用的是中文弯撇号
                .replaceAll("[’‘`´]", "'")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9'\\s-]", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    public static List<String> tokens(String s) {
        String n = normalize(s == null ? "" : s);
        if (n.isEmpty()) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        for (String t : n.split(" ")) {
            if (!t.isBlank()) {
                out.add(t);
            }
        }
        return out;
    }

    /** Levenshtein 编辑距离（带提前剪枝） */
    public static int distance(String a, String b) {
        if (a.equals(b)) {
            return 0;
        }
        int n = a.length();
        int m = b.length();
        if (Math.abs(n - m) > MAX_SPELL_DISTANCE) {
            return MAX_SPELL_DISTANCE + 1;
        }
        int[] prev = new int[m + 1];
        int[] cur = new int[m + 1];
        for (int j = 0; j <= m; j++) {
            prev[j] = j;
        }
        for (int i = 1; i <= n; i++) {
            cur[0] = i;
            for (int j = 1; j <= m; j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                cur[j] = Math.min(Math.min(cur[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
            }
            int[] tmp = prev;
            prev = cur;
            cur = tmp;
        }
        return prev[m];
    }

    private static double round3(double v) {
        return Math.round(v * 1000.0) / 1000.0;
    }
}
