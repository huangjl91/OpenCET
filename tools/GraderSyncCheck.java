import com.cet.common.TranslationGrader;
import com.cet.dto.CoreWord;

import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * 双端评分一致性对照 —— 后端侧结果输出。
 *
 * 读 .runtime/sync-cases.tsv（由 tools/grader-sync.mts 生成），逐条评分，
 * 输出与 .runtime/sync-ts.tsv 完全同构的行，供 diff 比对。不要单独运行，用 tools/grader-sync.sh。
 */
public class GraderSyncCheck {

    public static void main(String[] args) throws Exception {
        PrintStream out = new PrintStream(System.out, true, StandardCharsets.UTF_8);
        List<String> lines = Files.readAllLines(Path.of(".runtime/sync-cases.tsv"), StandardCharsets.UTF_8);
        StringBuilder sb = new StringBuilder();

        int n = 0;
        for (String line : lines) {
            if (line.isBlank()) {
                continue;
            }
            String[] parts = line.split("\t", -1);
            String id = parts[0];
            String answer = parts[1];
            String reference = parts[2];
            String coreField = parts.length > 3 ? parts[3] : "";

            List<CoreWord> cores = new ArrayList<>();
            if (!coreField.isEmpty()) {
                for (String en : coreField.split("\\|\\|")) {
                    if (!en.isEmpty()) {
                        cores.add(new CoreWord(en, ""));
                    }
                }
            }

            TranslationGrader.Result r = TranslationGrader.grade(answer, reference, cores);

            StringBuilder kind = new StringBuilder();
            for (CoreWord cw : cores) {
                if (r.hit().contains(cw.getEn())) {
                    kind.append('H');
                } else if (r.reorder().contains(cw.getEn())) {
                    kind.append('R');
                } else if (r.near().stream().anyMatch(x -> x.expected().equals(cw.getEn()))) {
                    kind.append('N');
                } else if (r.miss().contains(cw.getEn())) {
                    kind.append('M');
                } else {
                    kind.append('?');
                }
            }

            sb.append(String.join("\t",
                    id,
                    String.valueOf(r.score()),
                    String.valueOf(r.coreScore()),
                    String.valueOf(r.lengthScore()),
                    String.valueOf(r.languageScore()),
                    String.format("%.3f", r.coreRate()),
                    String.format("%.3f", r.lengthFit()),
                    String.format("%.3f", r.redundancy()),
                    kind.length() == 0 ? "-" : kind.toString())).append('\n');
            n++;
        }

        Files.writeString(Path.of(".runtime/sync-java.tsv"), sb.toString(), StandardCharsets.UTF_8);
        out.println("后端侧用例 " + n + " 条 → .runtime/sync-java.tsv");
    }
}
