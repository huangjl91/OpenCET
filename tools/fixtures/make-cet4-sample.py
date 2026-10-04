# 生成 tools/fixtures/cet4-sample.pdf 的源脚本（回归测试用）。
#
# 用法（需要 python-docx 与 LibreOffice）：
#   python tools/fixtures/make-cet4-sample.py
#   soffice --headless --convert-to pdf --outdir tools/fixtures tools/fixtures/cet4-sample.docx
#
# 刻意做成「真实四级整卷」的排版：Part I~IV、听力/阅读各有 Section A/B/C、
# 选项各自占一行、选词填空 10 空 + 词库每行一个、结尾中文翻译段落。
# 这些形态正是 PDF 抽取最容易翻车的地方。
import os

from docx import Document

HERE = os.path.dirname(os.path.abspath(__file__))

LINES = [
    "2023年6月大学英语四级考试真题（第1套）",
    "",
    "Part I Writing",
    "(30 minutes)",
    "Directions: For this part, you are allowed 30 minutes to write an essay on the use of short videos. You should write at least 120 words but no more than 180 words.",
    "",
    "Part II Listening Comprehension",
    "(25 minutes)",
    "Section A",
    "Directions: In this section, you will hear three news reports. At the end of each news report, you will hear two or three questions.",
    "Questions 1 to 2 are based on the news report you have just heard.",
    "1.",
    "A) The number of cyclists has risen sharply.",
    "B) Bike lanes are being removed in many cities.",
    "C) Cycling accidents have doubled in ten years.",
    "D) Most Americans cycle to work every day.",
    "2.",
    "A) The rising price of petrol.",
    "B) Better bike lanes and health awareness.",
    "C) Government financial support.",
    "D) The popularity of bike-sharing apps.",
    "Section B",
    "Directions: In this section, you will hear two long conversations.",
    "Questions 8 to 9 are based on the conversation you have just heard.",
    "8.",
    "A) She travelled around the province.",
    "B) She taught English in a village school.",
    "C) She worked on a local farm.",
    "D) She did research on local culture.",
    "Section C",
    "Directions: In this section, you will hear three passages.",
    "Questions 16 to 17 are based on the passage you have just heard.",
    "16.",
    "A) It is cheap.",
    "B) It is slow.",
    "C) It is safe.",
    "D) It is noisy.",
    "",
    "Part III Reading Comprehension",
    "(40 minutes)",
    "Section A",
    "Directions: In this section, there is a passage with ten blanks. You are required to select one word for each blank from a list of choices given in a word bank following the passage.",
    "Reading books has a __26__ effect on children. According to a recent study, children who read for pleasure every day __27__ to have larger vocabularies. The study also found that reading aloud before bed helps them __28__ better language habits. However, researchers warn that the __29__ of reading matters more than the time spent on it. Parents are __30__ to choose books that match their children's interests.",
    "A) advised",
    "B) acquire",
    "C) beneficial",
    "D) efficient",
    "E) impact",
    "F) frequency",
    "G) tend",
    "H) relax",
    "I) quality",
    "J) consequently",
    "",
    "Section B",
    "Directions: In this section, you are going to read a passage with ten statements attached to it.",
    "A) The idea of online learning has become increasingly popular among students.",
    "B) Many universities now offer courses that can be taken entirely online.",
    "C) Some employers still doubt the value of an online degree.",
    "D) Students in rural areas may benefit most from online education.",
    "36. The author suggests that online courses are cheaper than traditional ones.",
    "37. Some employers doubt the value of online degrees.",
    "",
    "Section C",
    "Directions: There are 2 passages in this section. Each passage is followed by some questions.",
    "Passage One",
    "Questions 46 to 47 are based on the following passage.",
    "For years, experts have warned that sitting for long hours is harmful to our health. A recent study adds a new detail: how you sit may matter less than how often you stand up.",
    "46.",
    "A) Sitting for long hours is no longer a health risk.",
    "B) How often one stands up matters more than how one sits.",
    "C) Regular exercise after work can remove all health risks.",
    "D) Adjustable desks are a must in every office.",
    "47.",
    "A) The total amount of time one sits.",
    "B) The lack of interruption in sitting.",
    "C) The wrong way of sitting.",
    "D) Working out after office hours.",
    "",
    "Part IV Translation",
    "(30 minutes)",
    "Directions: For this part, you are allowed 30 minutes to translate a passage from Chinese into English.",
    "剪纸是中国传统的民间艺术，有着两千多年的历史。剪纸作品通常用红纸制作，因为红色在中国文化中象征着吉祥和幸福。",
]


def main() -> None:
    doc = Document()
    for line in LINES:
        doc.add_paragraph(line)
    out = os.path.join(HERE, "cet4-sample.docx")
    doc.save(out)
    print("written:", out, "(%d lines)" % len(LINES))


if __name__ == "__main__":
    main()
