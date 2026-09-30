"""Read-only QA of pipeline exports; never repairs the documents."""
import hashlib
import json
import argparse
import subprocess
import zipfile
from pathlib import Path
from xml.etree import ElementTree
from pypdf import PdfReader

parser = argparse.ArgumentParser()
parser.add_argument('--inspected-pdf', action='append', default=[], choices=['contestacion', 'apelacion', 'amparo', 'penal'],
                    help='Record only after a human/agent has inspected every page of the current render.')
args = parser.parse_args()
root = Path('audit/final-pre-windows-readiness')
poppler = Path(r'C:\Users\yahir\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe')
results = []
for case in ['contestacion', 'apelacion', 'amparo', 'penal']:
    directory = root / 'controlled-cases' / case
    journey = json.loads((directory / 'journey.json').read_text(encoding='utf-8'))
    if any(journey['exports'][format]['status'] != 'EXPORTED_DRAFT' for format in ['docx', 'pdf']):
        results.append(dict(case=case, status='BLOCKED_NO_CURRENT_ARTIFACT',
                            oldFiles='STALE_HISTORICAL_FILES_NOT_REGENERATED', exports=journey['exports']))
        continue
    pdf = directory / 'produced-draft.pdf'
    docx = directory / 'produced-draft.docx'
    reader = PdfReader(pdf)
    with zipfile.ZipFile(docx) as archive:
        xml = ElementTree.fromstring(archive.read('word/document.xml'))
        docx_text = ' '.join(e.text or '' for e in xml.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'))
    image_dir = root / 'legal-quality-causal' / 'pdf-render' / case
    image_dir.mkdir(parents=True, exist_ok=True)
    render = subprocess.run([str(poppler), '-scale-to', '1400', '-png', str(pdf.resolve()), str((image_dir / 'page').resolve())], capture_output=True, text=True)
    pages = [page.extract_text() or '' for page in reader.pages]
    result = dict(case=case, pdfPages=len(pages), pdfWords=len(' '.join(pages).split()), docxWords=len(docx_text.split()),
                  pdfSha256=hashlib.sha256(pdf.read_bytes()).hexdigest(), docxSha256=hashlib.sha256(docx.read_bytes()).hexdigest(),
                  renderExit=render.returncode, renderError=render.stderr, images=[str(p) for p in image_dir.glob('*.png')],
                  pdfVisualQA='INSPECTED_INCOMPLETE_LEGAL_DRAFT_NOT_CERTIFIED' if case in args.inspected_pdf else 'NOT_VERIFIED_UNTIL_IMAGES_INSPECTED',
                  docxVisualQA='NOT_VERIFIED_BUNDLED_LIBREOFFICE_UNAVAILABLE_ON_WINDOWS',
                  syntheticPenalPhrasePresent='delito de imputado' in (docx_text + ' '.join(pages)).lower())
    results.append(result)
(root / 'legal-quality-causal' / 'artifacts-qa.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(results, ensure_ascii=False, indent=2))
