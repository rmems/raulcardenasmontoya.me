#!/usr/bin/env python3
"""Build Raul Cardenas Montoya's one-page résumé PDF with hyperlinks.

This script is the source for the site's public/resume.pdf. Edit the script,
never the PDF by hand. Keep the output to one page, single column, with a
real text layer (verify: `pdfinfo public/resume.pdf` shows Pages: 1 and
`pdftotext public/resume.pdf -` extracts clean text).

Counts printed on the résumé (crates, downloads, datasets, merged upstream
PRs) are fetched live from the crates.io, Hugging Face and GitHub public
APIs at build time and printed with their as-of date. If a source is
unreachable the build fails instead of printing stale numbers. Other
figures (per-project results) are project facts stated in this script.

Requires: Python 3, fpdf2 (`pip install fpdf2`), DejaVu Sans (Debian/Ubuntu:
fonts-dejavu-core; Fedora: dejavu-sans-fonts).
"""
import datetime
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

try:
    from fpdf import FPDF
except ImportError:
    sys.exit("fpdf2 is not installed. Run: pip install fpdf2")

OUT = str(Path(__file__).resolve().parent.parent / "public" / "resume.pdf")
UA = {"User-Agent": "rmems-resume-builder (https://raulcardenasmontoya.me)"}
ALLOWED_HOSTS = {"crates.io", "huggingface.co", "api.github.com"}

# Mirror src/artifacts/hf-source.mjs so the résumé and the site count the same
# datasets: only repos with data files, minus the explicit exclusions.
CARD_FILES = {"README.md", ".gitattributes", ".gitignore"}
EXCLUDED_DATASETS = {"rmems/agent-honest-stop-episodes"}
# Repo ids and collection slugs come back from the API and go into request
# paths; admit only the shapes Hugging Face actually issues.
HF_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9_.-]+$")


def fetch_json(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        sys.exit(f"Refusing URL outside the allowlist: {url}")
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        # Listings are cursor-paginated; refuse a truncated list rather than
        # silently drop repos.
        if 'rel="next"' in (r.headers.get("Link") or ""):
            sys.exit(f"{url} is paginated beyond the requested limit")
        return json.load(r)


def listable_dataset_ids():
    """Dataset repos the site would list: data files present and not excluded."""
    datasets = fetch_json("https://huggingface.co/api/datasets?author=rmems&limit=1000")
    ids = set()
    for d in datasets:
        repo_id = d["id"]
        if not HF_ID.fullmatch(repo_id):
            sys.exit(f"Unexpected dataset id from Hugging Face: {repo_id!r}")
        if repo_id in EXCLUDED_DATASETS:
            continue
        info = fetch_json("https://huggingface.co/api/datasets/"
                          + urllib.parse.quote(repo_id))
        data_files = [s for s in info.get("siblings", []) if s["rfilename"] not in CARD_FILES]
        if data_files:
            ids.add(repo_id)
    return ids


def fetch_counts():
    """Live counts for the résumé. Any failure aborts the build."""
    try:
        crates_resp = fetch_json("https://crates.io/api/v1/crates?user_id=390342&per_page=100")
        if crates_resp.get("meta", {}).get("next_page"):
            sys.exit("crates.io crate list is paginated beyond the requested page size")
        crates = sorted(crates_resp["crates"], key=lambda c: -c["downloads"])
        dataset_ids = listable_dataset_ids()
        collections = fetch_json("https://huggingface.co/api/collections?owner=rmems&limit=100")
        factory = [c for c in collections
                   if (c.get("title") or "").lower().startswith("synthetic data factory")]
        factory_ids = set()
        for c in factory:
            if not HF_ID.fullmatch(c["slug"]):
                sys.exit(f"Unexpected collection slug from Hugging Face: {c['slug']!r}")
            full = fetch_json("https://huggingface.co/api/collections/"
                              + urllib.parse.quote(c["slug"]))
            factory_ids.update(i["id"] for i in full.get("items", [])
                               if i.get("type") == "dataset" and i["id"] in dataset_ids)
        prs = fetch_json("https://api.github.com/search/issues?q=type:pr+author:rmems+is:merged"
                         "+repo:Halloweedev/usagepal+repo:griffinwork40/agent-afk")
    except SystemExit:
        raise
    except Exception as e:
        sys.exit(f"Could not fetch live counts ({e}). Refusing to build with stale numbers.")
    today = datetime.date.today()
    return {
        "crates": crates,
        "crates_total": sum(c["downloads"] for c in crates),
        "datasets": len(dataset_ids),
        "factory_datasets": len(factory_ids),
        "factory_collections": len(factory),
        "merged_prs": prs["total_count"],
        "as_of": f"{today.strftime('%b')} {today.day}, {today.year}",
    }


def find_font(filename, family):
    candidates = [
        f"/usr/share/fonts/truetype/dejavu/{filename}",    # Debian/Ubuntu
        f"/usr/share/fonts/dejavu-sans-fonts/{filename}",  # Fedora
        f"/usr/share/fonts/dejavu/{filename}",             # Fedora alt / Arch
        f"/usr/local/share/fonts/{filename}",
        str(Path.home() / ".fonts" / filename),
    ]
    for c in candidates:
        if Path(c).exists():
            return c
    try:  # fontconfig fallback (Linux/macOS with fontconfig installed)
        out = subprocess.run(["fc-match", "-f", "%{file}", family],
                             capture_output=True, text=True, timeout=10)
        p = out.stdout.strip()
        if p and Path(p).exists():
            return p
    except Exception:
        pass
    sys.exit(f"DejaVu Sans not found ({filename}). Install it (Debian/Ubuntu: "
             "fonts-dejavu-core; Fedora: dejavu-sans-fonts) or adjust find_font().")


class Resume(FPDF):
    def header(self):
        pass  # fpdf2 calls this hook per page; the résumé has no running header.

    def footer(self):
        pass  # fpdf2 calls this hook per page; the résumé has no running footer.


def main():
    c = fetch_counts()
    top4 = ", ".join(f"{k['name']} ({k['downloads']:,})" for k in c["crates"][:4])
    rest = ", ".join(k["name"] for k in c["crates"][4:])

    pdf = Resume(orientation="P", unit="pt", format="Letter")
    pdf.set_auto_page_break(True, margin=26)
    pdf.set_margins(44, 28, 44)
    pdf.add_font("DS", "", find_font("DejaVuSans.ttf", "DejaVu Sans"))
    pdf.add_font("DS", "B", find_font("DejaVuSans-Bold.ttf", "DejaVu Sans:bold"))
    pdf.add_page()

    w = pdf.w - 88
    font = "DS"
    ink = (30, 30, 30)

    def heading(text):
        pdf.ln(3)
        pdf.set_font(font, "B", 9.5)
        pdf.set_text_color(*ink)
        pdf.cell(w, 11, text.upper(), new_x="LMARGIN", new_y="NEXT")
        y = pdf.get_y()
        pdf.set_draw_color(170, 170, 170)
        pdf.line(44, y, 44 + w, y)
        pdf.ln(2.5)

    def para(s, size=7.4, gap=0.4):
        pdf.set_font(font, "", size)
        pdf.set_text_color(*ink)
        pdf.write_html(s)
        pdf.ln(gap + size * 0.35)

    def title_line(s, size=8.4):
        pdf.set_font(font, "", size)
        pdf.set_text_color(*ink)
        pdf.write_html(s)
        pdf.ln(size * 0.35)

    bullet = "\u2022 "

    # ---------------- header ----------------
    pdf.set_font(font, "B", 17)
    pdf.set_text_color(*ink)
    pdf.cell(w, 19, "Raul Cardenas Montoya", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font(font, "", 9)
    pdf.cell(w, 11, "AI Engineer (Intern / Junior)  |  ML Infrastructure Engineer \u2014 Model Evaluation & Synthetic Data",
             new_x="LMARGIN", new_y="NEXT")
    pdf.set_font(font, "", 8.5)
    pdf.write_html(
        'Austin metropolitan area \u00b7 open to relocation \u00b7 '
        '<a href="mailto:montoyaraul34@gmail.com">montoyaraul34@gmail.com</a>')
    pdf.ln(9)
    pdf.write_html(
        '<a href="https://www.linkedin.com/in/raul-cardenas-montoya">LinkedIn</a>'
        ' \u00b7 <a href="https://github.com/rmems">GitHub</a>'
        ' \u00b7 <a href="https://crates.io/users/rmems">crates.io</a>'
        ' \u00b7 <a href="https://huggingface.co/rmems">Hugging Face</a>')
    pdf.ln(10)

    # ---------------- summary ----------------
    heading("Summary")
    para(f"AI Engineer building ML infrastructure for agentic systems, synthetic data, and model evaluation in "
         f"Rust and Python. Finishing a B.S. in AI Engineering at WGU (expected Sept 2027) and available for "
         f"internships and junior roles now. Author of {len(c['crates'])} published Rust crates "
         f"({c['crates_total']:,} downloads) and {c['datasets']} public Hugging Face datasets. Merged contributor "
         f"to externally maintained open-source projects ({c['merged_prs']} merged PRs). "
         f"(Counts as of {c['as_of']}.)")

    # ---------------- open-source contributions ----------------
    heading("Open-Source Contributions")
    title_line('<b>UsagePal</b> (PR <a href="https://github.com/Halloweedev/usagepal/pull/48">#48</a>, '
               '<a href="https://github.com/Halloweedev/usagepal/pull/56">#56</a>, '
               '<a href="https://github.com/Halloweedev/usagepal/pull/67">#67</a>, merged)')
    para(bullet + "Added Linux support and Devin usage tracking backed by a CLI and SQLite, with credential discovery "
         "from the environment.")
    para(bullet + "Added Antigravity metrics and Grok usage-cost tracking: session-turn spend that survives log "
         "truncation, per-model pricing attribution, and support for subscription-only billing tiers.")
    title_line('<b>agent-afk</b> (PR <a href="https://github.com/griffinwork40/agent-afk/pull/1019">#1019</a>, '
               '<a href="https://github.com/griffinwork40/agent-afk/pull/1242">#1242</a>, merged)')
    para(bullet + "Implemented the xAI/Grok provider: API-key and OAuth authentication, provider selection, and "
         "credential handling.")
    para(bullet + "Fixed OAuth compatibility and added dependency-injection seams so the provider layer is testable "
         "without live credentials.")

    # ---------------- selected projects ----------------
    heading("Selected Projects")
    title_line('<b>Synthetic data factories</b> \u2014 synthetic-factory \u00b7 medsynth \u00b7 euthymia \u00b7 AI-ML-SWE synthetic tutor')
    para(bullet + '<a href="https://github.com/rmems/synthetic-factory">synthetic-factory</a>: deterministic synthetic-data platform with a reviewed generator '
         f"registry, fail-closed rights provenance (unknown provenance resolves to blocked), and strict audit "
         f"and export gates. {c['factory_datasets']} datasets published across {c['factory_collections']} "
         "Hugging Face collections; every record replays from (pack, seed, actions).")
    para(bullet + '<a href="https://github.com/rmems/medsynth">medsynth</a> (Rust, in development): contract-first pipeline for synthetic MCQs, case vignettes, '
         "and tutoring examples in pre-med and medical education \u2014 source-anchored records admitted only "
         "after verification. Gold seed set of 24 records + 6 near-miss negatives in review.")
    para(bullet + '<a href="https://github.com/rmems/euthymia">euthymia</a> (Rust, in development): synthetic Emotional Resilience Engineering scenarios governed '
         "by a versioned behavioral contract \u2014 target ~250 rubric-scored SFT examples across six "
         "competencies, plus DPO pairs.")
    para(bullet + '<a href="https://github.com/rmems/AI-ML-SWE-synthetic-tutor">AI-ML-SWE synthetic tutor</a> (Rust + Julia over ZMQ, in development): multi-turn tutoring '
         "dialogues for post-training a tutor model \u2014 verified problems, labelled student "
         "misconceptions, and hint-ladder tutor turns.")
    title_line('<b>Published Rust crates</b> (<a href="https://crates.io/users/rmems">crates.io/users/rmems</a>)')
    para(bullet + f"{len(c['crates'])} crates, {c['crates_total']:,} total downloads (as of {c['as_of']}): "
         f"{top4}, {rest}.")
    para(bullet + "silicon-bridge exports Q8.8 fixed-point weights for FPGA targets; myelin-accelerator provides CUDA "
         "kernels for Blackwell (sm_120); engram-parser provides one format-independent API for GGUF and "
         "Safetensors checkpoints.")
    title_line('<b><a href="https://github.com/rmems/agoge-forger">agoge-forger</a></b>')
    para(bullet + "Local-first post-training harness (LoRA/QLoRA) with immutable run manifests, split-integrity "
         "checks, and leakage detection.")
    para(bullet + "Ran a QLoRA SFT of Granite 4.1 3B on 129 synthetic-factory code-repair records and published the "
         "evaluation: the harness's own scoring caught that the apparent exact-match gain was a markdown-fence "
         "formatting artifact \u2014 fence-normalized, base and SFT tie at 10/16 (2 improved, 2 regressed, "
         "12 tied). The SFT taught fence formatting, not capability; the harness now scores execution, "
         "not strings.")
    title_line('<b><a href="https://github.com/rmems/writ">writ</a></b>')
    para(bullet + "A coordination layer for multi-agent git work: adversarial parsing of git commands (SafeGitCommand) "
         "that rejects force/detach operations \u2014 including the self-found short-option-cluster bypass "
         "(checkout -fb, switch -fd) fixed in writ#223 \u2014 over Rust/Python worktrees with process "
         "supervision and bounded repair cycles.")
    title_line('<b><a href="https://github.com/Limen-Neural">Limen-Neural / Spikenaut-SNN</a></b>')
    para(bullet + "Built Limen-Neural, a Rust neuromorphic crate stack: spiking-neuron dynamics, sensory encoding, "
         "NIR interchange, Q8.8 FPGA export, and CUDA acceleration primitives.")
    para(bullet + "Shipped Spikenaut-SNN on Hugging Face: a 16-neuron LIF network with telemetry-driven artifacts "
         "and an export contract targeting a Xilinx Artix-7 FPGA.")

    # ---------------- technical skills ----------------
    heading("Technical Skills")
    para("<b>Languages:</b> Rust, Python, Julia, CUDA C/C++, shell")
    para("<b>ML:</b> PyTorch, TRL, PEFT (LoRA/QLoRA), Hugging Face, quantization, GGUF/Safetensors, MoE, "
         "evaluation harnesses, synthetic-data generation and curation")
    para("<b>Systems:</b> Linux (Fedora), Docker, GitHub Actions, self-hosted CI, ZMQ, git worktrees, "
         "JSONL/Parquet pipelines")

    # ---------------- education ----------------
    heading("Education")
    para("<b>B.S. in AI Engineering</b>, Western Governors University (WGU), expected Sept 2027")
    para("Texas State University, San Marcos, TX, Spring 2026")
    para("Concordia University Texas, Austin, TX, Computer Science, Fall 2025")
    para("Austin Community College, Kyle, TX, Business Administration, 2019\u20132020 and 2024\u20132025")

    if pdf.pages_count != 1:
        sys.exit(f"Résumé ran to {pdf.pages_count} pages; trim content before publishing.")
    # Write atomically: temp file in the same directory, then replace.
    tmp_out = OUT + ".tmp"
    pdf.output(tmp_out)
    os.replace(tmp_out, OUT)
    print(f"wrote {OUT} | pages: {pdf.pages_count} | counts as of {c['as_of']}: "
          f"{len(c['crates'])} crates / {c['crates_total']:,} downloads / {c['datasets']} datasets / "
          f"{c['factory_datasets']} factory datasets in {c['factory_collections']} collections / "
          f"{c['merged_prs']} merged PRs")


if __name__ == "__main__":
    main()
