/* =========================================================
   Shared export helpers — real CSV / Excel / PDF file generation
   from tabular data already on screen. No backend involved: these
   build the file entirely client-side and hand it to the browser
   as a download, via SheetJS (XLSX) and jsPDF.
   ========================================================= */
(function(){
  "use strict";
  window.MET = window.MET || {};

  function triggerDownload(blob, filename){
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }

  function csvEscape(val){
    const s = val === null || val === undefined ? "" : String(val);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /** headers: string[]; rows: array of arrays (same length as headers).
   *  opts (optional): { summary: [[label,value], ...] — extra key/value lines
   *  shown above the table (an empty-first-cell row renders as a spacer);
   *  note: string — a short explanatory line shown above the table }. */
  window.MET.exportCSV = function(filename, headers, rows, opts){
    opts = opts || {};
    const lines = [];
    if(opts.summary && opts.summary.length){
      opts.summary.forEach(function(r){ lines.push(r.map(csvEscape).join(",")); });
      lines.push("");
    }
    if(opts.note){ lines.push(csvEscape(opts.note)); lines.push(""); }
    lines.push(headers.map(csvEscape).join(","));
    rows.forEach(function(r){ lines.push(r.map(csvEscape).join(",")); });
    // Leading BOM so Excel opens UTF-8 (₹ etc.) correctly instead of mangling it.
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, filename);
  };

  window.MET.exportExcel = function(filename, sheetName, headers, rows, opts){
    if(typeof XLSX === "undefined"){ MET.toastError("Excel export library failed to load."); return; }
    opts = opts || {};
    const data = [];
    if(opts.summary && opts.summary.length){
      opts.summary.forEach(function(r){ data.push(r); });
      data.push([]);
    }
    if(opts.note){ data.push([opts.note]); data.push([]); }
    data.push(headers);
    rows.forEach(function(r){ data.push(r); });
    const sheet = XLSX.utils.aoa_to_sheet(data);
    sheet["!cols"] = headers.map(function(h){ return { wch: Math.max(12, String(h).length + 2) }; });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, sheetName.slice(0, 31));
    XLSX.writeFile(wb, filename);
  };

  window.MET.exportPDF = function(filename, title, headers, rows, opts){
    if(typeof window.jspdf === "undefined"){ MET.toastError("PDF export library failed to load."); return; }
    opts = opts || {};
    const doc = new window.jspdf.jsPDF({ orientation: rows.length && headers.length > 5 ? "landscape" : "portrait" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let y = 18;

    doc.setFontSize(15);
    doc.setFont(undefined, "bold");
    doc.text(title, margin, y);
    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    doc.setTextColor(120);
    doc.text("Expensio — generated " + new Date().toLocaleString(), margin, y + 6);
    doc.setTextColor(20);
    y += 16;

    if(opts.summary && opts.summary.length){
      opts.summary.forEach(function(r){
        if(!r.length || r[0] === ""){ y += 3; return; }
        doc.setFontSize(9.5);
        doc.setFont(undefined, "bold");
        doc.text(String(r[0]), margin, y);
        if(r[1] !== undefined && r[1] !== ""){
          doc.setFont(undefined, "normal");
          doc.text(String(r[1]), margin + 95, y);
        }
        y += 6;
      });
      y += 3;
    }
    if(opts.note){
      doc.setFontSize(8.5);
      doc.setFont(undefined, "italic");
      doc.setTextColor(120);
      const noteLines = doc.splitTextToSize(opts.note, pageWidth - margin * 2);
      doc.text(noteLines, margin, y);
      y += noteLines.length * 5 + 6;
      doc.setTextColor(20);
      doc.setFont(undefined, "normal");
    }

    const colWidth = (pageWidth - margin * 2) / headers.length;
    const rowHeight = 8;

    function drawRow(cells, isHeader){
      if(y > doc.internal.pageSize.getHeight() - 16){
        doc.addPage();
        y = 18;
      }
      if(isHeader){
        doc.setFillColor(240, 240, 245);
        doc.rect(margin, y - 5, pageWidth - margin * 2, rowHeight, "F");
        doc.setFont(undefined, "bold");
      } else {
        doc.setFont(undefined, "normal");
      }
      doc.setFontSize(8.5);
      cells.forEach(function(cell, i){
        doc.text(String(cell === null || cell === undefined ? "" : cell), margin + i * colWidth + 2, y);
      });
      y += rowHeight;
    }

    drawRow(headers, true);
    rows.forEach(function(r){ drawRow(r); });

    doc.save(filename);
  };

  /** Builds a browser-safe, timestamped filename: "Category Report - Sep 2026.csv" */
  window.MET.exportFilename = function(base, ext){
    return base.replace(/[\\/:*?"<>|]/g, "-") + "." + ext;
  };
})();
