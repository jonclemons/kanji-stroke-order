# Kokugo Graph Coverage

Generated: 2026-04-24T04:23:49.197Z

## Summary

- Official JP-COS elementary kanji: 1026/1026
- Current local v1 kanji mirror: 1006
- Graph kanji nodes: 1026
- Vocabulary nodes: 6838
- Example nodes: 1
- Domains: 9 (漢字, 語彙, 文法, 読むこと・読解, 古典, ことわざ・慣用句, 四字熟語, 書くこと・表現, 話すこと・聞くこと)
- Claims with provenance in SQLite: 32192

## Migration Gap

The current local app dataset has 1006 kanji. The current official JP-COS elementary allocation has 1026 kanji, so the local mirror is short by 20 kanji.

Missing official kanji in local v1 mirror: 茨 媛 岡 潟 岐 熊 香 佐 埼 崎 滋 鹿 縄 井 沖 栃 奈 梨 阪 阜

Local-vs-official grade assignment mismatches among shared kanji: 37

Mismatched shared kanji: 賀(local 5, official 4) 群(local 5, official 4) 徳(local 5, official 4) 富(local 5, official 4) 城(local 6, official 4) 囲(local 4, official 5) 喜(local 4, official 5) 紀(local 4, official 5) 救(local 4, official 5) 型(local 4, official 5) 航(local 4, official 5) 告(local 4, official 5) 殺(local 4, official 5) 史(local 4, official 5) 士(local 4, official 5) 象(local 4, official 5) 賞(local 4, official 5) 貯(local 4, official 5) 停(local 4, official 5) 堂(local 4, official 5) 得(local 4, official 5) 毒(local 4, official 5) 費(local 4, official 5) 粉(local 4, official 5) 脈(local 4, official 5) 歴(local 4, official 5) 胃(local 4, official 6) 腸(local 4, official 6) 恩(local 5, official 6) 券(local 5, official 6) 承(local 5, official 6) 舌(local 5, official 6) 銭(local 5, official 6) 退(local 5, official 6) 敵(local 5, official 6) 俵(local 5, official 6) 預(local 5, official 6)

## Grade Coverage

| Grade | Official | Local v1 | Missing Local | Vocab Links | Reading Links |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 80 | 80 | 0 | 640 | 368 |
| 2 | 160 | 160 | 0 | 1280 | 624 |
| 3 | 200 | 200 | 0 | 1600 | 702 |
| 4 | 202 | 200 | 20 | 1456 | 618 |
| 5 | 193 | 185 | 0 | 1544 | 585 |
| 6 | 191 | 181 | 0 | 1528 | 586 |

## Progressions

- `grade-only`: official grade eligibility from 学習指導要領LOD. Its `sequence` is the allocation-table position, not a classroom lesson order.
- Publisher profiles such as 光村図書, 東京書籍, and 教育出版 are reserved as overlays and should be added only after source-backed sequence data exists.

## Wider 国語 Surface

| Domain | Status | Next Population Source |
| --- | --- | --- |
| 漢字 | populated | mext-elementary-course-of-study-2017-pdf, mext-grade-kanji-2017, kanjiapi-v1-local-info, kanjivg-local-svg |
| 語彙 | partially-populated | kanjiapi-v1-local-words |
| 文法 | schema-ready | mext-elementary-course-of-study-2017-pdf, mext-elementary-kokugo-commentary-2022-pdf, jp-cos-all-20250927, jp-textbook-all-teaching-unit-20260407 |
| 読むこと・読解 | schema-ready | mext-elementary-course-of-study-2017-pdf, mext-elementary-kokugo-commentary-2022-pdf, jp-cos-all-20250927, jp-textbook-all-teaching-unit-20260407 |
| 古典 | schema-ready | mext-elementary-course-of-study-2017-pdf, mext-elementary-kokugo-commentary-2022-pdf, jp-cos-all-20250927, jp-textbook-all-teaching-unit-20260407 |
| ことわざ・慣用句 | schema-ready | mext-elementary-course-of-study-2017-pdf, mext-elementary-kokugo-commentary-2022-pdf, jp-cos-all-20250927, jp-textbook-all-teaching-unit-20260407 |
| 四字熟語 | schema-ready | mext-elementary-course-of-study-2017-pdf, mext-elementary-kokugo-commentary-2022-pdf, jp-cos-all-20250927, jp-textbook-all-teaching-unit-20260407 |
| 書くこと・表現 | schema-ready | mext-elementary-course-of-study-2017-pdf, mext-elementary-kokugo-commentary-2022-pdf, jp-cos-all-20250927, jp-textbook-all-teaching-unit-20260407 |
| 話すこと・聞くこと | schema-ready | mext-elementary-course-of-study-2017-pdf, mext-elementary-kokugo-commentary-2022-pdf, jp-cos-all-20250927, jp-textbook-all-teaching-unit-20260407 |

## Example Rendering Check

- Canonical: 五月に卒業した
- Reading: ごがつにそつぎょうした
- Known `五` only demo: 五がつにそつぎょうした
- Grade-only grade 1 rendering shows all grade-1-known kanji; publisher/custom progressions can be stricter within a grade.
- Vocabulary exports are candidate/unreviewed graph nodes until kid-facing curation rules are added.

## Source Policy

- Government curriculum data is mirrored as the baseline public claim.
- Every generated node carries source-backed provenance claims or a local seed provenance marker.
- Textbook and publisher-derived ordering is modeled as advisory overlay data, not global truth.

## Pipeline Boundary

- `mirror:sources` is the only networked source collection command.
- `graph:build`, `graph:export`, and `graph:check` are offline and read local mirrors/static data.
- Runtime product code should consume only `public/data/v2/graph` JSON or an equivalent static mirror.
- The graph artifact is provider-neutral and can be hosted from Git, static hosting, R2, S3-compatible storage, Backblaze B2, GitHub Releases, or community mirrors.
