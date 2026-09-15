from base64 import b64encode
from pathlib import Path


OUT = Path(r"C:\Users\thirs\Documents\Calculo MS Tesla\outputs\market_study")
PAGE = OUT / "download-market-share-pngs.html"
SUV = OUT / "suv-market-share-2025-2026.png"
PASSENGER = OUT / "passenger-market-share-2025-2026.png"


def encoded(path):
    return b64encode(path.read_bytes()).decode("ascii")


html = f"""<div id="download-market-share-pngs" class="download-market-share-pngs">
  <h2>Descargar gráficos PNG</h2>
  <div class="download-grid">
    <section>
      <button class="btn btn-primary" type="button" data-file="suv">Descargar PNG SUV</button>
      <img alt="Vista previa SUV" src="data:image/png;base64,{encoded(SUV)}">
    </section>
    <section>
      <button class="btn btn-primary" type="button" data-file="passenger">Descargar PNG Vehículos de Pasajeros</button>
      <img alt="Vista previa Vehículos de Pasajeros" src="data:image/png;base64,{encoded(PASSENGER)}">
    </section>
  </div>
</div>

<style>
  #download-market-share-pngs {{
    width: 100%;
    color: var(--foreground);
  }}

  #download-market-share-pngs h2 {{
    margin: 0 0 14px;
    font-weight: 500;
  }}

  #download-market-share-pngs .download-grid {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 18px;
  }}

  #download-market-share-pngs section {{
    display: grid;
    gap: 10px;
    align-content: start;
  }}

  #download-market-share-pngs img {{
    width: 100%;
    max-height: 220px;
    object-fit: contain;
    border: 1px solid var(--border);
  }}
</style>

<script>
  (() => {{
    const root = document.getElementById("download-market-share-pngs");
    const files = {{
      suv: {{
        name: "suv-market-share-2025-2026.png",
        data: "{encoded(SUV)}"
      }},
      passenger: {{
        name: "passenger-market-share-2025-2026.png",
        data: "{encoded(PASSENGER)}"
      }}
    }};

    function toBlob(base64) {{
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {{
        bytes[i] = binary.charCodeAt(i);
      }}
      return new Blob([bytes], {{ type: "image/png" }});
    }}

    function downloadPng(key) {{
      const file = files[key];
      if (!file) return;
      const url = URL.createObjectURL(toBlob(file.data));
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}

    root.querySelectorAll("[data-file]").forEach((button) => {{
      button.addEventListener("click", () => downloadPng(button.dataset.file));
    }});
  }})();
</script>
"""

PAGE.write_text(html, encoding="utf-8")
print(PAGE)
