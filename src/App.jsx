import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Loader2, Copy, Check, X, AlertCircle, Sparkles, Trash2, Wand2, ArrowRight, Download } from 'lucide-react';

export default function AdmissionSummaryGenerator() {
  // === Main summary state ===
  const [files, setFiles] = useState([]);
  const [extractedTexts, setExtractedTexts] = useState({});
  const [pastedSources, setPastedSources] = useState({
    opd: '', ed: '', admission: '', progress: '', reports: ''
  });
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState('');
  const [pdfjsReady, setPdfjsReady] = useState(false);
  const [copiedSection, setCopiedSection] = useState(null);
  const [tokenEstimate, setTokenEstimate] = useState(0);

  // === OpenEvidence prompt + plan transformer ===
  const [oePrompt, setOePrompt] = useState('');
  const [oeResponse, setOeResponse] = useState('');
  const [planOutput, setPlanOutput] = useState('');
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState('');

  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  useEffect(() => {
    if (window.pdfjsLib) { setPdfjsReady(true); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        setPdfjsReady(true);
      }
    };
    script.onerror = () => setError('Failed to load PDF parser. Please paste text instead.');
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    const allText =
      Object.values(extractedTexts).join('\n\n') + '\n\n' +
      Object.values(pastedSources).join('\n\n');
    setTokenEstimate(Math.ceil(allText.length / 3.5));
  }, [extractedTexts, pastedSources]);

  // Auto-extract OpenEvidence prompt from output
  useEffect(() => {
    if (!output) return;
    const m = output.match(/##\s+9\.\s+OpenEvidence Prompt\s*\n([\s\S]*?)(?=\n##\s+\d+\.|$)/);
    if (m) setOePrompt(m[1].trim());
  }, [output]);

  const extractTextFromPDF = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let lastY = null, line = '';
      const lines = [];
      for (const item of content.items) {
        const y = Math.round(item.transform[5]);
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          if (line.trim()) lines.push(line.trim());
          line = '';
        }
        line += item.str + ' ';
        lastY = y;
      }
      if (line.trim()) lines.push(line.trim());
      fullText += lines.join('\n') + '\n\n';
    }
    return fullText.replace(/\n{3,}/g, '\n\n').trim();
  };

  const handleFiles = async (newFiles) => {
    setError('');
    setExtracting(true);
    const updated = { ...extractedTexts };
    const fileList = [...files];
    for (const file of newFiles) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setError(`Skipped ${file.name}: only PDFs supported here. Paste text for other formats.`);
        continue;
      }
      if (updated[file.name]) continue;
      try {
        const text = await extractTextFromPDF(file);
        updated[file.name] = text;
        fileList.push({ name: file.name, size: file.size, chars: text.length });
      } catch (err) {
        setError(`Failed to read ${file.name}: ${err.message}`);
      }
    }
    setExtractedTexts(updated);
    setFiles(fileList);
    setExtracting(false);
  };

  const handleFileInput = (e) => { if (e.target.files) handleFiles(Array.from(e.target.files)); };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (dropRef.current) dropRef.current.classList.remove('border-stone-900');
    if (e.dataTransfer.files) handleFiles(Array.from(e.dataTransfer.files));
  };
  const removeFile = (name) => {
    const updated = { ...extractedTexts };
    delete updated[name];
    setExtractedTexts(updated);
    setFiles(files.filter(f => f.name !== name));
  };

  // === Robust copy with execCommand fallback (artifacts often run in restricted iframes) ===
  const copyToClipboard = async (text) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* fall through */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '0';
      ta.style.opacity = '0';
      ta.setAttribute('readonly', '');
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  };

  const copySection = async (sectionId, text) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedSection(sectionId);
      setTimeout(() => setCopiedSection(null), 1500);
    } else {
      setError('Copy failed. Please select text manually with Ctrl/Cmd+C.');
    }
  };

  // === System prompt ===
  const buildSystemPrompt = () => `You are a clinical scribe at National Taiwan University Hospital (臺大醫院). Inputs are de-identified outpatient/ED/admission/progress records and reports, each labeled by source. Output ONE comprehensive admission summary using the EXACT plain-text formatting syntax below — designed for direct copy-paste into a hospital EHR that strips ALL formatting (no Markdown rendering, no bold, no italics, no font changes). Hierarchy MUST be conveyed by SYMBOLS alone.

INPUT SOURCE LABELS:
- "Past OPD" — outpatient clinic notes
- "Past ED" — emergency department notes
- "Past Admission" — prior hospitalization records
- "Progress note" — daily progress notes during this admission
- "Reports" — lab, imaging, pathology
- "PDF: <filename>" — extracted text from uploaded PDFs
Use ALL provided sources.

LANGUAGE: English. Exceptions in original Chinese: company/employer names, family relationship terms (大伯, 表姊), and person names.

==========================================================
PLAIN-TEXT HIERARCHY SYMBOLS (USE EXACTLY)
==========================================================
Tier 1  — Section title (used as tool label only): "## N. Title"
Tier 2  — Major subsection: 【Title】  (full-width brackets U+3010 / U+3011)
Tier 3  — Sub-block: [Title]  (regular square brackets)
Tier 4  — Anatomical region (PE/Neuro): ---Title---  (3 hyphens each side, no spaces)
Tier 4 alt — SOAP top block: {Title}  (curly braces)
Tier 5  — Inline emphasis on PRIMARY admission diagnosis name only: ==diagnosis name==

Bullets:
  ．   (full-width dot U+FF0E) — Personal/Family/Surgical/Hospitalization history items
  -    (hyphen + space) — PE inline observations, ROS items, SOAP bullets, Symptoms to monitor
  -    (hyphen NO space) — Sub-items inside neuro CN/Motor/Reflex/Sensation lists, matching template
  #.   (literal hash + period + space) — Diagnosis and PMH entries; NEVER replace with digits

Indentation:
  Match the user's EHR template exactly: ROS items 4-space indent under their numbered system header; CN/Motor sub-items begin column 1 with "-" (no space).

Other rules:
- Date: YYYY/MM/DD HH:MM if time present, else YYYY/MM/DD.
- Doctor: Dr. [Surname]. Hospital: Full English Name (中文名). Drug: Generic (Brand) on first mention.
- NO ICD codes anywhere.
- Completed treatment: ", status post [treatment]". Ongoing: ", on [treatment]".
- Do NOT use Markdown bold (**X**) or italics (*X*) ANYWHERE in the output.

==========================================================
OUTPUT STRUCTURE
==========================================================

## 1. Chief Complaint / Admission Purpose
One line. "Symptom + duration" OR "Admitted for [procedure/workup]".

## 2. Present Illness
Multi-paragraph NEJM Case Record prose. NO bullets, NO subheadings, NO symbols.
SCOPE — focus only on what is directly relevant to the working/primary diagnosis and admission purpose. OMIT history threads unrelated to the primary problem.
- Earlier paragraphs: onset of CC, LQQOPERA, prior medical visits, workups, findings (positives AND important negatives related to the primary diagnosis).
- Conflicting/serial labs/imaging: list each value with its date inline.
- FINAL paragraph MUST begin with "This time, " and describe the current admission presentation, vital signs, key findings, and planned investigations or treatments.

## 3. Past History

【Past Medical History】

[Active]
#. (entry)
#. ...

[Underlying]
#. ...

[Resolved]
#. ...

Each # entry: definite diagnosis, extent / risk / stage / grade, status post completed treatments, on ongoing treatments, treatment effects, ongoing problems. Simplified format OK for HTN/DM/dyslipidemia but MUST include diagnosis + severity/grade + treatment + treatment response. Do NOT include the current admission's primary diagnosis here.

【Surgical History】
．Procedure (year, hospital); indication; outcome
．...

【Hospitalization History】
．Admission period; hospital; reason; outcome
．...

【Personal History】

[Social History]
．Alcohol: 
．Betel nuts: 
．Cigarette: 
．Drug: 

[Allergy]
．Denied food or drug allergy
．(Reaction) to (drug name)   (only if applicable)

[TOCC]
．Travel: 
．Occupation: 
．Contact: 
．Cluster: 

【Family History】
．HTN: 
．DM: 
．Dyslipidemia: 
．Cancer: 
．Denied 

## 4. Physical Examination

OUTPUT THE FULL TEMPLATE BELOW. For each line: if a finding is documented in records, REPLACE the default text with the documented finding (preserving line label and punctuation style). For abnormal findings, change "(-)" to "(+)" and add description. For undocumented items, KEEP the default normal phrasing as a fillable placeholder.

【Vital Signs】
BH: X cm, BW: X kg
T: X °C, P: X bpm, R: X /min
BP: X/X mmHg
SpO₂: X %
Pain score: X

【Physical Examination】

---Head-Eye-ENT---
Grossly normal
Conjunctiva: pink, sclera: anicteric
Pupil: isocoric, 3mm/3mm
Light reflex (R/L): +/+
EOM: full and free

---Neck---
Jugular vein engorgement(-)
Goiter(-)
Meningismus: Kernig sign(-); Brudzinski sign(-)
Carotid bruit(-)

---Chest---
Thoracic cage contour: symmetric, retraction(-)
Vocal fremitus and expansion: symmetric
Percussion: resonant
Breathing sound: clear, crackles(-), wheezes(-), rhonchi(-), stridor(-), friction rubs(-)

---Heart---
Heart beat: regular
Murmurs(-), LV lift(-), RV heave(-)
Increased cardiac size by percussion(-)

---Abdomen---
Flat & soft
Superficial vein engorgement(-)
Protruded umbilicus(-)
Bowel sound: normoactive
Tenderness(-)
Hepato-jugular reflux(-)
Liver and spleen: impalpable
Castell sign(-)

---Extremities---
Freely movable
Pulses symmetric and intact
Pitting edema(-)
Clubbing finger(-)

---Back---
Knocking pain(-)

---Skin---
Abnormal pigmentation(-)
Petechiae(-), Purpura(-), Ecchymoses(-), Telangiectasia(-), Rash(-), Plaque(-)

【Neurological Examination】

INCLUDE this entire 【Neurological Examination】 block ONLY when neuro exam is documented in records OR the working diagnosis has neurological relevance (stroke, seizure, weakness/plegia, parkinsonism, encephalopathy, neuropathy, headache, dizziness, dementia, gait disturbance). Otherwise OMIT the entire 【Neurological Examination】 block.

When included, output the full skeleton below; replace defaults with documented findings, keep undocumented items as normal placeholders:

---Consciousness---
EVM6V5, oriented to time, space, person

---CNS (right/left)---
CNII:
-Visual acuity: normal
-Visual field: intact (by confrontation test)
-Light reflex: +/+, isocoric: 3mm/3mm
CNIII/IV/VI:
-EOM full and free
-Ptosis(-/-), Diplopia(-), Nystagmus(-)
-Pursuit: normal; Saccade: normal
CNV:
-Sensory: symmetric intact
-Mastication: good
CNVII: no facial palsy
CNVIII: hearing: intact
CNIX:
-Gag reflex
-Uvula elevation: no deviation
CNX: dysarthria(-)
CNXI: sternocleidomastoid muscle 5/5, trapezius muscle 5/5
CNXII:
-Tongue protrusion: no deviation
-Fasciculation(-), atrophy(-)

---Motor (right/left)---
Inspection: muscle wasting(-), fasciculation(-)
Muscle tone: spasticity(-), rigidity(-)
Muscle power:
-Neck flexion (C3-C5) 5; extension (C3-C5) 5
-Shoulder abduction (C5) 5/5
-Elbow flexion (C6) 5/5; extension (C7) 5/5
-Wrist flexion (C7) 5/5; extension (C6) 5/5
-Grasping (C8) 5/5
-Finger abduction (T1) 5/5
-Hip flexion (L2) 5/5
-Knee flexion (S1) 5/5; extension (L3) 5/5
-Ankle dorsiflexion (L4) 5/5; plantar flexion (S1) 5/5
-Big toe extension (L5) 5/5; flexion (S1) 5/5

---Reflex (right/left)---
Deep tendon reflexes:
-Biceps (C5/6): 2+/2+
-Triceps (C7): 2+/2+
-Brachioradialis (C5/6): 2+/2+
-Knee (L4): 2+/2+
-Ankle (S1): 2+/2+
Hoffmann sign: -/-, Tromner sign: -/-
Babinski sign: flexor/flexor
Frontal signs: Snout(-), Grasp(-), Suck(-), Rooting(-), Palmomental(-)

---Sensation (right/left)---
Small fiber:
-Temperature: symmetric, no decrease
-Pinprick: symmetric, no decrease
-Light touch: symmetric, no decrease
Large fiber:
-Vibration: Glabella: 8/8; Thumb: 8/8, 8/8; Great toe: 8/8, 8/8
-Joint position: Fingers: 10/10, 10/10; Great toe: 10/10, 10/10
-Romberg test: negative
No obvious sensory level

---Coordination---
Finger-nose-finger test: no dysmetria
Rapid alternating test: no disdiadochokinesia
Heel-knee-shin test: no dysmetria or zigzagging

---EPS---
Mask face(-)
Resting tremor(-)
Bradykinesia(-)
Rigidity(-)
Postural reflex: pull test: normal
Chorea(-)
Ballism(-)

---Gait---
Not assessed (or describe documented gait)

## 5. Review of System
(■ positive, □ negative)

1.  General
    □ weight loss, □ easy-fatigability, □ night sweats, □ anemia, □ sleep problems

2.  HEENT
    □ headache, □ dizziness, □ injury
    □ blurred vision, □ strabismus, □ ocular pain, □ glaucoma, □ cataract
    □ otalgia, □ otorrhea, □ hearing impairment, □ tinnitus, □ vertigo
    □ nasal stuffiness, □ nasal discharge, □ epistaxis
    □ gum bleeding, □ sore throat, □ oral ulcer, □ hoarseness

3.  Neck/Breast/Armpit
    □ neck stiffness, □ swollen glands, □ goiter, □ breast lumps, □ nipple discharge

4.  Respiratory
    □ dyspnea, □ chest pain, □ pleuritic chest pain, □ bronchitis/emphysema
    □ cough, □ hemoptysis, □ blood-tinged sputum, □ fever, □ cyanosis

5.  Cardiovascular
    □ exertional chest tightness, □ palpitation, □ nocturnal dyspnea
    □ syncope, □ intermittent claudication, □ arrhythmia, □ varicose veins

6.  Gastrointestinal
    □ nausea, □ vomiting, □ poor appetite, □ dysphagia
    □ heartburn, □ hunger pain, □ abdominal pain
    □ diarrhea, □ bloody/tarry stool, □ flatulence, □ constipation, □ tenesmus
    □ change of bowel habit, □ small caliber of stool, □ hemorrhoid

7.  Urogenital
    □ flank pain, □ hematuria, □ urinary frequency, □ polyuria/oliguria, □ urgency
    □ hesitancy, □ nocturia, □ impotence, □ urinary burn, □ kidney stones

8.  Musculoskeletal
    □ bone pain, □ arthralgia, □ myalgia, □ swelling, □ stiffness, □ gout, □ damage

9.  Neurologic
    □ numbness, □ paresis/plegia, □ seizures, □ fainting, □ weakness, □ spasms/tremor

10. Skin
    □ petechiae, □ purpurae, □ rash, □ itching, □ hair/nail changes, □ jaundice

11. Metabolic
    □ cold intolerance, □ thirsty, □ hunger

12. Psychiatric
    □ dementia, □ depression, □ mania, □ anxiety

Replace each "□" with "■" only when the input EXPLICITLY documents the symptom as present.

## 6. Symptoms / Signs to Monitor

[Positive Expected]
- ...
- ...

[Negative Expected]
- ...
- ...

(Items the resident should actively check based on the working diagnosis and differential.)

## 7. Diagnosis

[Active]
#. ==Primary admission diagnosis==, extent / stage / grade, status post / on treatments, ongoing problems
#. (next active PMH item)
#. ...

[Underlying]
#. ...

[Resolved]
#. ...

ONLY the FIRST [Active] entry — the primary admission diagnosis name — is wrapped in ==...==. All other entries: no == wrapping. Every entry begins with literal "#. " — never with a digit. NO ICD codes.

## 8. SOAP

{Subjective}
- ...
- ...

{Objective}

[Vital Sign]
- BP, P, T, R, SpO₂, pain score (with date/time)

[Physical Examination]
- Key positive PE findings on this admission

[Lab]
- Key admission labs with collection date

[Culture]
- Cultures sent (site, date) + results if available

[Image]
- Imaging done (modality, date) + key findings

[Other]
- ECG, special studies, scoring scales, etc.

(Omit any [sub-block] with no data.)

{Assessment}
- One concise line per active problem; reader must understand at a glance.

{Plan}
- Short ACTIONS only, < 12 words each. Describe the action ONLY — never the rationale, never the goal.
- Examples:
  "- Monitor vital signs"
  "- Monitor auscultatory findings daily"
  "- Pursue pending results: blood culture, sputum culture, viral isolation panel, Mycoplasma PCR"
  "- Continue empirical Ampicillin-Sulbactam (Unasyn) IV (started 2025/03/07)"
  "- Consider repeat CXR (QW)"
  "- Consider repeat sputum culture (planned 2025/03/12)"
- Append frequency or planned date in parentheses where relevant.
- FORBIDDEN: "with goal of...", "targeting...", "to assess...", "based on...", "in order to...".

{Goal}
- Discharge criteria only.
- Examples: "- Afebrile for 48 hours", "- Tolerating oral diet", "- Sustained SpO₂ ≥ 95% on room air", "- Able to ambulate independently".

## 9. OpenEvidence Prompt

Output a self-contained natural-language prompt for OpenEvidence (NOT EHR-formatted; no 【】[]{}). Format:

For a hospitalized patient with the following profile:
- Demographics: [age range, gender; omit if not stated]
- Primary admission diagnosis: [diagnosis]
- Active comorbidities: [list]
- Key presentation: [1-2 sentence summary]
- Key abnormal findings: [labs / imaging / cultures with values & dates]
- Treatments already started this admission: [list with start dates]

Please provide complete, evidence-based, bullet-point recommendations covering:
1. Pharmacological treatment — drug (Generic [Brand]), dose, route, frequency, duration, with key contraindications and renal/hepatic adjustments
2. Non-pharmacological management
3. Monitoring parameters and their frequency
4. Discharge criteria
5. Red flags requiring escalation
6. Relevant guidelines or landmark trials to cite

Where evidence is graded, indicate strength of recommendation.

(Fill all [bracketed] fields concretely from the patient's records. Leave NO brackets in the final output.)`;

  // === Generate ===
  const generate = async () => {
    setError(''); setOutput(''); setOePrompt('');
    const parts = [];
    const labelMap = {
      opd: 'Past OPD', ed: 'Past ED', admission: 'Past Admission',
      progress: 'Progress note', reports: 'Reports'
    };
    for (const key of Object.keys(labelMap)) {
      const text = pastedSources[key]?.trim();
      if (text) parts.push(`=== ${labelMap[key]} ===\n${text}`);
    }
    for (const [name, text] of Object.entries(extractedTexts)) {
      parts.push(`=== PDF: ${name} ===\n${text}`);
    }
    const inputText = parts.join('\n\n').trim();
    if (!inputText) { setError('Please upload PDFs or paste records first.'); return; }
    setLoading(true);
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8000,
          system: buildSystemPrompt(),
          messages: [{ role: 'user', content: `Generate the admission summary from these records:\n\n${inputText}` }]
        })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API error ${response.status}: ${errText.slice(0, 200)}`);
      }
      const data = await response.json();
      const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
      setOutput(text);
    } catch (err) {
      setError(`Generation failed: ${err.message}`);
    } finally { setLoading(false); }
  };

  // === Plan transformer ===
  const PLAN_TRANSFORMER_PROMPT = `Convert the user's input — a treatment recommendation in any format (prose, bullets, mixed) — into NTUH SOAP {Plan} + {Goal} format.

OUTPUT EXACTLY the two blocks below, in this order, with no preamble, no postamble, no commentary.

{Plan}
- (action bullet, < 12 words)
- ...

{Goal}
- (discharge criterion bullet)
- ...

PLAN BULLET RULES:
- One short ACTION per bullet. Describe the action ONLY — never the rationale, never the goal.
- Each bullet under 12 words.
- Drug names: Generic (Brand) on first mention. Doses/routes in parentheses if essential.
- Append frequency or planned date in parentheses: "(QD)", "(QW)", "(planned 2025/03/12)", "(started 2025/03/07)".
- FORBIDDEN: "with goal of...", "targeting...", "to assess...", "based on...", "in order to...".
- Examples:
  "- Monitor vital signs"
  "- Monitor auscultatory findings daily"
  "- Continue empirical Ampicillin-Sulbactam (Unasyn) IV (started 2025/03/07)"
  "- Pursue pending results: blood culture, sputum culture, viral isolation panel, Mycoplasma PCR"
  "- Consider repeat CXR (QW)"
  "- Consider repeat sputum culture (planned 2025/03/12)"

GOAL BULLET RULES:
- Discharge criteria only.
- Examples: "- Afebrile for 48 hours", "- Tolerating oral diet", "- Sustained SpO₂ ≥ 95% on room air", "- Able to ambulate independently".

Date format: YYYY/MM/DD. NO ICD codes. NO Markdown bold or italics.`;

  const transformPlan = async () => {
    if (!oeResponse.trim()) { setPlanError('Please paste the OpenEvidence response first.'); return; }
    setPlanError(''); setPlanOutput(''); setPlanLoading(true);
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          system: PLAN_TRANSFORMER_PROMPT,
          messages: [{ role: 'user', content: oeResponse }]
        })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API error ${response.status}: ${errText.slice(0, 200)}`);
      }
      const data = await response.json();
      const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
      setPlanOutput(text);
    } catch (err) {
      setPlanError(`Conversion failed: ${err.message}`);
    } finally { setPlanLoading(false); }
  };

  // === Section parsing ===
  const stripSectionHeader = (body) => body.replace(/^##\s+.+\n+/, '');
  const parseSections = (text) => {
    if (!text) return [];
    const sections = [];
    const lines = text.split('\n');
    let current = null;
    for (const line of lines) {
      const m = line.match(/^##\s+(.+)$/);
      if (m && !line.startsWith('###')) {
        if (current) sections.push(current);
        current = { title: m[1], lines: [line] };
      } else if (current) current.lines.push(line);
    }
    if (current) sections.push(current);
    return sections.map(s => ({ title: s.title, body: s.lines.join('\n') }));
  };
  const sections = parseSections(output);
  const summarySections = sections.filter(s => !/^9\.\s/.test(s.title));

  // === Download all as a single .txt file ===
  const downloadAll = async () => {
    const banner = (title) =>
      `\n${'═'.repeat(64)}\n  ${title.toUpperCase()}\n${'═'.repeat(64)}\n\n`;

    let content = `ADMISSION SUMMARY\nGenerated: ${new Date().toLocaleString()}\n${'═'.repeat(64)}\n`;

    for (const sec of summarySections) {
      content += banner(sec.title);
      content += stripSectionHeader(sec.body).trim() + '\n';
    }
    if (oePrompt.trim()) {
      content += banner('9. OpenEvidence Prompt');
      content += oePrompt.trim() + '\n';
    }
    if (oeResponse.trim()) {
      content += banner('10. OpenEvidence Response (raw)');
      content += oeResponse.trim() + '\n';
    }
    if (planOutput.trim()) {
      content += banner('11. Converted SOAP Plan');
      content += planOutput.trim() + '\n';
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `admission-summary_${ts}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // === Renderer: WYSIWYC — preserve every symbol; use only typography (size/weight/color/spacing) for hierarchy ===
  const renderEhrText = (md) => {
    const lines = md.split('\n');
    return lines.map((line, idx) => {
      const trimmed = line.trim();

      // Empty line
      if (trimmed === '') return <div key={idx} className="h-3" />;

      // 【Major Subsection】
      if (/^【.+】$/.test(trimmed)) {
        return (
          <div key={idx} className="mt-6 mb-2 text-[1.15rem] font-medium text-stone-900 tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
            {trimmed}
          </div>
        );
      }

      // {SOAP Block}
      if (/^\{.+\}$/.test(trimmed)) {
        return (
          <div key={idx} className="mt-5 mb-2 text-[1.1rem] font-medium text-stone-900 italic" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
            {trimmed}
          </div>
        );
      }

      // [Sub-block]
      if (/^\[.+\]$/.test(trimmed)) {
        return (
          <div key={idx} className="mt-3 mb-1 text-[0.98rem] font-medium text-stone-800" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
            {trimmed}
          </div>
        );
      }

      // ---Region--- (PE/Neuro)
      if (/^---.+---$/.test(trimmed)) {
        return (
          <div key={idx} className="mt-3 mb-0.5 text-[0.92rem] italic text-stone-600" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
            {trimmed}
          </div>
        );
      }

      // #. Diagnosis entry — render with hanging indent, possibly with ==X== highlight
      if (/^#\.\s/.test(line)) {
        const content = line.replace(/^#\.\s+/, '');
        const parts = content.split(/(==[^=]+==)/g).filter(Boolean);
        return (
          <div key={idx} className="my-1 leading-relaxed text-stone-800 pl-5 -indent-5">
            <span className="text-stone-400 mr-1">#.</span>
            {parts.map((p, j) =>
              /^==.+==$/.test(p) ? (
                <span key={j} className="font-semibold text-stone-900 underline decoration-stone-300 decoration-1 underline-offset-4">
                  {p}
                </span>
              ) : <span key={j}>{p}</span>
            )}
          </div>
        );
      }

      // ROS system header (e.g., "1.  General")
      if (/^\s*\d+\.\s+[A-Z][A-Za-z\/\s\-]*$/.test(line) && line.length < 40) {
        return (
          <div key={idx} className="mt-2 font-medium text-stone-800 leading-relaxed">
            {line}
          </div>
        );
      }

      // Default — preserve whitespace for ROS items, motor sub-items, etc.
      return (
        <div key={idx} className="leading-relaxed text-stone-800" style={{ whiteSpace: 'pre-wrap' }}>
          {line || '\u00A0'}
        </div>
      );
    });
  };

  const totalSourceChars =
    Object.values(extractedTexts).reduce((a, b) => a + b.length, 0) +
    Object.values(pastedSources).reduce((a, b) => a + b.length, 0);

  const sourceFields = [
    { key: 'opd', label: 'Past OPD', placeholder: 'Outpatient clinic notes…' },
    { key: 'ed', label: 'Past ED', placeholder: 'Emergency department notes…' },
    { key: 'admission', label: 'Past Admission', placeholder: 'Prior hospitalization records…' },
    { key: 'progress', label: 'Progress note', placeholder: 'Daily progress notes during this admission…' },
    { key: 'reports', label: 'Reports', placeholder: 'Lab / imaging / pathology / ECG reports…' }
  ];

  const clearAll = () => {
    setFiles([]); setExtractedTexts({});
    setPastedSources({ opd: '', ed: '', admission: '', progress: '', reports: '' });
    setOutput(''); setOePrompt(''); setOeResponse(''); setPlanOutput('');
    setError(''); setPlanError('');
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>{`
        .accent-line { background: linear-gradient(90deg, #1c1917 0%, #1c1917 30%, transparent 100%); }
        .ehr-output { font-family: 'Fraunces', Georgia, serif; font-optical-sizing: auto; font-size: 0.94rem; line-height: 1.65; }
      `}</style>

      <header className="border-b border-stone-200 bg-stone-50/90 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-baseline gap-3">
              <h1 className="font-medium text-3xl tracking-tight" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Admission Summary</h1>
              <span className="text-stone-400 text-xs">v4 · de-identified inputs only</span>
            </div>
            <p className="text-stone-500 text-sm mt-1">ED &amp; OPD records → structured admission note · NEJM Case Record style · EHR-ready plain text</p>
          </div>
          {output && (
            <button
              onClick={downloadAll}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-stone-900 text-stone-900 hover:bg-stone-900 hover:text-stone-50 transition-colors"
              title="Download all generated content as a single .txt file"
            >
              <Download size={14} /> Download all (.txt)
            </button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* INPUT */}
          <section className="space-y-5">
            <div>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-xl" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Input</h2>
                <div className="text-xs text-stone-500">
                  {totalSourceChars.toLocaleString()} chars · ~{tokenEstimate.toLocaleString()} tokens
                </div>
              </div>
              <div className="h-px accent-line mb-4" />
            </div>

            <div
              ref={dropRef}
              onDragOver={(e) => { e.preventDefault(); dropRef.current?.classList.add('border-stone-900'); }}
              onDragLeave={() => dropRef.current?.classList.remove('border-stone-900')}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-stone-300 hover:border-stone-900 transition-colors cursor-pointer p-6 text-center bg-white"
            >
              <input type="file" ref={fileInputRef} onChange={handleFileInput} accept="application/pdf" multiple className="hidden" />
              <Upload size={24} className="mx-auto text-stone-400 mb-2" strokeWidth={1.5} />
              <p className="text-sm">{pdfjsReady ? 'Drop PDFs or click to upload' : 'Loading PDF parser…'}</p>
              <p className="text-xs text-stone-500 mt-1">Multiple files accepted · text extracted in your browser, not uploaded</p>
            </div>

            {extracting && (
              <div className="flex items-center gap-2 text-sm text-stone-600">
                <Loader2 size={14} className="animate-spin" /> Extracting text…
              </div>
            )}

            {files.length > 0 && (
              <ul className="space-y-1.5">
                {files.map(f => (
                  <li key={f.name} className="flex items-center justify-between bg-white border border-stone-200 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2 truncate">
                      <FileText size={14} className="text-stone-400 shrink-0" />
                      <span className="truncate text-xs">{f.name}</span>
                      <span className="text-stone-400 text-xs">· {f.chars.toLocaleString()} chars</span>
                    </span>
                    <button onClick={() => removeFile(f.name)} className="text-stone-400 hover:text-stone-900 ml-2"><X size={14} /></button>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-3 pt-2">
              <div className="text-xs uppercase tracking-wider text-stone-500">Or paste text (any combination)</div>
              {sourceFields.map(sf => (
                <div key={sf.key}>
                  <div className="flex items-baseline justify-between mb-1">
                    <label className="text-xs font-medium text-stone-700">{sf.label}</label>
                    <span className="text-[10px] text-stone-400">{pastedSources[sf.key].length.toLocaleString()}</span>
                  </div>
                  <textarea
                    value={pastedSources[sf.key]}
                    onChange={(e) => setPastedSources({ ...pastedSources, [sf.key]: e.target.value })}
                    placeholder={sf.placeholder}
                    className="w-full h-24 px-3 py-2 bg-white border border-stone-300 focus:border-stone-900 outline-none text-xs resize-y"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={generate}
                disabled={loading || extracting || totalSourceChars === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-stone-900 text-stone-50 hover:bg-stone-700 disabled:bg-stone-300 disabled:cursor-not-allowed transition-colors text-sm tracking-wide"
              >
                {loading ? (<><Loader2 size={14} className="animate-spin" /> Generating…</>) : (<><Sparkles size={14} /> Generate Summary</>)}
              </button>
              {totalSourceChars > 0 && !loading && (
                <button onClick={clearAll} className="flex items-center gap-1.5 text-stone-500 hover:text-stone-900 text-sm">
                  <Trash2 size={13} /> Clear
                </button>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 text-red-900 text-sm">
                <AlertCircle size={16} className="shrink-0 mt-0.5" /> <div>{error}</div>
              </div>
            )}
          </section>

          {/* SUMMARY */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-xl" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>Summary</h2>
              {output && (
                <button onClick={() => copySection('all', summarySections.map(s => stripSectionHeader(s.body).trim()).join('\n\n'))}
                  className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-900">
                  {copiedSection === 'all' ? (<><Check size={12} /> Copied</>) : (<><Copy size={12} /> Copy all</>)}
                </button>
              )}
            </div>
            <div className="h-px accent-line mb-4" />

            {!output && !loading && (
              <div className="border border-stone-200 bg-white p-12 text-center text-stone-400">
                <FileText size={36} className="mx-auto mb-3" strokeWidth={1} />
                <p className="text-sm">Output will appear here</p>
              </div>
            )}

            {loading && !output && (
              <div className="border border-stone-200 bg-white p-12 text-center text-stone-500">
                <Loader2 size={28} className="mx-auto mb-3 animate-spin" strokeWidth={1.5} />
                <p className="text-sm">Generating structured summary…</p>
                <p className="text-xs text-stone-400 mt-1">≈ 30–60 seconds for a typical record set</p>
              </div>
            )}

            {output && (
              <div className="space-y-3">
                {summarySections.map((sec, i) => {
                  const ehrBody = stripSectionHeader(sec.body).trim();
                  return (
                    <article key={i} className="border border-stone-200 bg-white">
                      <header className="flex items-center justify-between px-4 py-2 bg-stone-100 border-b border-stone-200">
                        <span className="text-xs uppercase tracking-wider text-stone-600 font-medium">{sec.title}</span>
                        <button
                          onClick={() => copySection(`s-${i}`, ehrBody)}
                          className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-900"
                          title="Copy plain text (EHR-ready)"
                        >
                          {copiedSection === `s-${i}` ? (<><Check size={11} /> Copied</>) : (<><Copy size={11} /> Copy</>)}
                        </button>
                      </header>
                      <div className="px-6 py-5 ehr-output text-stone-800">
                        {renderEhrText(ehrBody)}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* OPENEVIDENCE PROMPT */}
        {output && (
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <h2 className="text-xl" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>OpenEvidence Prompt</h2>
                <p className="text-xs text-stone-500 mt-0.5">Paste this into OpenEvidence to receive evidence-based, bullet-point treatment recommendations.</p>
              </div>
              <button
                onClick={() => copySection('oe-prompt', oePrompt)}
                disabled={!oePrompt}
                className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-900 disabled:text-stone-300"
              >
                {copiedSection === 'oe-prompt' ? (<><Check size={12} /> Copied</>) : (<><Copy size={12} /> Copy prompt</>)}
              </button>
            </div>
            <div className="h-px accent-line mb-4" />
            <textarea
              value={oePrompt}
              onChange={(e) => setOePrompt(e.target.value)}
              placeholder="Will be populated automatically after summary generation…"
              className="w-full h-64 px-4 py-3 bg-white border border-stone-200 focus:border-stone-900 outline-none text-xs leading-relaxed resize-y"
            />
            <p className="text-[11px] text-stone-400 mt-1">Editable — refine before pasting into OpenEvidence.</p>
          </section>
        )}

        {/* OE RESPONSE → SOAP PLAN */}
        {output && (
          <section>
            <div className="mb-3">
              <h2 className="text-xl" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>OpenEvidence Response → SOAP Plan</h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Paste OpenEvidence's reply (any format) and convert it into NTUH-style {`{Plan}`} + {`{Goal}`} bullets.
              </p>
            </div>
            <div className="h-px accent-line mb-4" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <label className="text-xs font-medium text-stone-700">OpenEvidence response</label>
                  <span className="text-[10px] text-stone-400">{oeResponse.length.toLocaleString()}</span>
                </div>
                <textarea
                  value={oeResponse}
                  onChange={(e) => setOeResponse(e.target.value)}
                  placeholder="Paste OpenEvidence's recommendations here — prose, bullets, or any format…"
                  className="w-full h-72 px-3 py-2 bg-white border border-stone-300 focus:border-stone-900 outline-none text-xs resize-y"
                />
                <div className="flex items-center gap-3 mt-2">
                  <button
                    onClick={transformPlan}
                    disabled={planLoading || !oeResponse.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-stone-50 hover:bg-stone-700 disabled:bg-stone-300 disabled:cursor-not-allowed transition-colors text-sm"
                  >
                    {planLoading ? (<><Loader2 size={14} className="animate-spin" /> Converting…</>) : (<><Wand2 size={14} /> Convert <ArrowRight size={12} /></>)}
                  </button>
                  {oeResponse && !planLoading && (
                    <button onClick={() => { setOeResponse(''); setPlanOutput(''); setPlanError(''); }}
                      className="flex items-center gap-1.5 text-stone-500 hover:text-stone-900 text-xs">
                      <Trash2 size={12} /> Clear
                    </button>
                  )}
                </div>
                {planError && (
                  <div className="flex items-start gap-2 p-2.5 mt-3 bg-red-50 border border-red-200 text-red-900 text-xs">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" /> <div>{planError}</div>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <label className="text-xs font-medium text-stone-700">{`{Plan} + {Goal}`} (EHR-ready)</label>
                  {planOutput && (
                    <button onClick={() => copySection('plan-out', planOutput)} className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-900">
                      {copiedSection === 'plan-out' ? (<><Check size={11} /> Copied</>) : (<><Copy size={11} /> Copy</>)}
                    </button>
                  )}
                </div>
                <textarea
                  value={planOutput}
                  onChange={(e) => setPlanOutput(e.target.value)}
                  placeholder="Converted plan will appear here…"
                  className="w-full h-72 px-3 py-2 bg-white border border-stone-300 focus:border-stone-900 outline-none text-xs resize-y"
                />
                <p className="text-[11px] text-stone-400 mt-1">Editable — review before pasting into the EHR.</p>
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="max-w-6xl mx-auto px-6 py-8 text-xs text-stone-400 border-t border-stone-200 mt-8">
        <p>Verify all output before clinical use. Patient identifiers should be removed from input. PDF text extraction occurs locally in your browser.</p>
      </footer>
    </div>
  );
}
