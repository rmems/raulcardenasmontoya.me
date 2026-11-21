#!/usr/bin/env python3
"""Build Raul Cardenas Montoya one-page resume PDF with hyperlinks.
Source for raulcardenasmontoya.me public/resume.pdf — draft text:
counts verified live against crates.io / Hugging Face on the build date.
"""
from fpdf import FPDF

from pathlib import Path
OUT = str(Path(__file__).resolve().parent.parent / "public" / "resume.pdf")

class Resume(FPDF):
    def header(self): pass
    def footer(self): pass

pdf = Resume(orientation="P", unit="pt", format="Letter")
pdf.set_auto_page_break(True, margin=26)
pdf.set_margins(44, 28, 44)
pdf.add_font("DS", "", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
pdf.add_font("DS", "B", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
pdf.add_page()

W = pdf.w - 88
FONT = "DS"
INK = (30, 30, 30)

def heading(text):
    pdf.ln(3)
    pdf.set_font(FONT, "B", 9.5)
    pdf.set_text_color(*INK)
    pdf.cell(W, 11, text.upper(), new_x="LMARGIN", new_y="NEXT")
    y = pdf.get_y()
    pdf.set_draw_color(170, 170, 170)
    pdf.line(44, y, 44 + W, y)
    pdf.ln(2.5)

def para(s, size=7.4, gap=0.4):
    pdf.set_font(FONT, "", size)
    pdf.set_text_color(*INK)
    pdf.write_html(s)
    pdf.ln(gap + size * 0.35)

def title_line(s, size=8.4):
    pdf.set_font(FONT, "", size)
    pdf.set_text_color(*INK)
    pdf.write_html(s)
    pdf.ln(size * 0.35)

B = "\u2022 "

# ---------------- header ----------------
pdf.set_font(FONT, "B", 17)
pdf.set_text_color(*INK)
pdf.cell(W, 19, "Raul Cardenas Montoya", new_x="LMARGIN", new_y="NEXT")
pdf.set_font(FONT, "", 9)
pdf.cell(W, 11, "AI Engineer (Intern / Junior)  |  ML Infrastructure Engineer \u2014 Model Evaluation & Synthetic Data",
         new_x="LMARGIN", new_y="NEXT")
pdf.set_font(FONT, "", 8.5)
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
para("AI Engineer building ML infrastructure for agentic systems, synthetic data, and model evaluation in "
     "Rust and Python. Finishing a B.S. in AI Engineering at WGU (expected Sept 2027) and available for "
     "internships and junior roles now. Author of 11 published Rust crates (22,549 downloads) and 70 public "
     "Hugging Face datasets. Merged contributor to externally maintained open-source projects (5 merged PRs).")

# ---------------- open-source contributions ----------------
heading("Open-Source Contributions")
title_line('<b>UsagePal</b> (PR <a href="https://github.com/Halloweedev/usagepal/pull/48">#48</a>, '
           '<a href="https://github.com/Halloweedev/usagepal/pull/56">#56</a>, '
           '<a href="https://github.com/Halloweedev/usagepal/pull/67">#67</a>, merged)')
para(B + "Added Linux support and Devin usage tracking backed by a CLI and SQLite, with credential discovery "
         "from the environment.")
para(B + "Added Antigravity metrics and Grok usage-cost tracking: session-turn spend that survives log "
         "truncation, per-model pricing attribution, and support for subscription-only billing tiers.")
title_line('<b>agent-afk</b> (PR <a href="https://github.com/griffinwork40/agent-afk/pull/1019">#1019</a>, '
           '<a href="https://github.com/griffinwork40/agent-afk/pull/1242">#1242</a>, merged)')
para(B + "Implemented the xAI/Grok provider: API-key and OAuth authentication, provider selection, and "
         "credential handling.")
para(B + "Fixed OAuth compatibility and added dependency-injection seams so the provider layer is testable "
         "without live credentials.")

# ---------------- selected projects ----------------
heading("Selected Projects")
title_line('<b>Synthetic data factories</b> \u2014 synthetic-factory \u00b7 medsynth \u00b7 euthymia \u00b7 AI-ML-SWE synthetic tutor')
para(B + '<a href="https://github.com/rmems/synthetic-factory">synthetic-factory</a>: deterministic synthetic-data platform with a reviewed generator '
         "registry, fail-closed rights provenance (unknown provenance resolves to blocked), and strict audit "
         "and export gates. 60 datasets published across 3 Hugging Face collections; every record replays "
         "from (pack, seed, actions).")
para(B + '<a href="https://github.com/rmems/medsynth">medsynth</a> (Rust, in development): contract-first pipeline for synthetic MCQs, case vignettes, '
         "and tutoring examples in pre-med and medical education \u2014 source-anchored records admitted only "
         "after verification. Gold seed set of 24 records + 6 near-miss negatives in review.")
para(B + '<a href="https://github.com/rmems/euthymia">euthymia</a> (Rust, in development): synthetic Emotional Resilience Engineering scenarios governed '
         "by a versioned behavioral contract \u2014 target ~250 rubric-scored SFT examples across six "
         "competencies, plus DPO pairs.")
para(B + '<a href="https://github.com/rmems/AI-ML-SWE-synthetic-tutor">AI-ML-SWE synthetic tutor</a> (Rust + Julia over ZMQ, in development): multi-turn tutoring '
         "dialogues for post-training a tutor model \u2014 verified problems, labelled student "
         "misconceptions, and hint-ladder tutor turns.")
title_line('<b>Published Rust crates</b> (<a href="https://crates.io/users/rmems">crates.io/users/rmems</a>)')
para(B + "11 crates, 22,549 total downloads: neuromod (6,153), nir-rs (3,617), axon-encoder (2,834), "
         "corpus-ipc (2,559), silicon-bridge, limbic-critic, synaptic-wiring, kinetic-signals, "
         "plasticity-lab, myelin-accelerator, engram-parser.")
para(B + "silicon-bridge exports Q8.8 fixed-point weights for FPGA targets; myelin-accelerator provides CUDA "
         "kernels for Blackwell (sm_120); engram-parser provides one format-independent API for GGUF and "
         "Safetensors checkpoints.")
title_line('<b><a href="https://github.com/rmems/agoge-forger">agoge-forger</a></b>')
para(B + "Local-first post-training harness (LoRA/QLoRA) with immutable run manifests, split-integrity "
         "checks, and leakage detection.")
para(B + "Ran a QLoRA SFT of Granite 4.1 3B on 129 synthetic-factory code-repair records and published the "
         "full evaluation: the pre-registered exact-match gain (0/16 \u2192 10/16) proved to be formatting, "
         "not capability \u2014 fence-normalized, base and SFT tie at 10/16 (2 improved, 2 regressed, 12 tied).")
title_line('<b><a href="https://github.com/rmems/writ">writ</a></b>')
para(B + "A coordination layer for multi-agent git work: adversarial parsing of git commands (SafeGitCommand) "
         "that rejects force/detach operations \u2014 including the self-found short-option-cluster bypass "
         "(checkout -fb, switch -fd) fixed in writ#223 \u2014 over Rust/Python worktrees with process "
         "supervision and bounded repair cycles.")
title_line('<b><a href="https://github.com/Limen-Neural">Limen-Neural / Spikenaut-SNN</a></b>')
para(B + "Built Limen-Neural, a Rust neuromorphic crate stack: spiking-neuron dynamics, sensory encoding, "
         "NIR interchange, Q8.8 FPGA export, and CUDA acceleration primitives.")
para(B + "Shipped Spikenaut-SNN on Hugging Face: a 16-neuron LIF network with telemetry-driven artifacts "
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

pdf.output(OUT)
print(f"wrote {OUT} | pages: {pdf.pages_count}")
