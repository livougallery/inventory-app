// ===== Factory tabel view-only "Cek Data" (TanStack Table v9) =====
// Dipakai oleh semua halaman /cek-data/*. Tiap tabel di satu halaman
// diberi prefix DOM sendiri supaya bisa lebih dari 1 tabel per halaman.
//
// Cara pakai (di inline <script> view EJS):
//   CekDataTable({
//     prefix: 'cdm1',               // id elemen: cdm1-global, cdm1-head, cdm1-body,
//                                    //            cdm1-info, cdm1-prev, cdm1-next, cdm1-flag,
//                                    //            cdm1-filters
//     data: rows,                    // array objek (sudah dinormalisasi di view bila perlu)
//     rowId: function (r) { return r.id; },
//     pageSize: 10,
//     flag: function (r) { ... },    // opsional — baris yang dianggap perlu dicek
//     columns: [
//       { id: 'kode',   header: 'Kode' },
//       { id: 'stok',   header: 'Stok',   type: 'num' },        // num | rp | tgl | text (default text)
//       { id: 'nama',   header: 'Nama',   cellClass: fn(row) }, // cellClass opsional -> class td
//       { id: 'tipe_label', header: 'Kategori', filterable: true }
//                                    // filterable: true -> dropdown filter per nilai unik kolom tsb
//     ]
//   });
(function () {
  var core = window.TanStackTableCore;
  var storeReactivityBindings = window.TanStackStoreBindings.storeReactivityBindings;

  var fmtRp = function (n) { return n == null ? '—' : 'Rp ' + Number(n).toLocaleString('id-ID'); };
  var fmtNum = function (n) { return n == null || n === '' ? '—' : Number(n).toLocaleString('id-ID'); };
  var fmtTgl = function (s) {
    if (!s) return '—';
    var d = new Date(s);
    return isNaN(d) ? s : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  function fmtValue(col, v) {
    switch (col.type) {
      case 'rp':   return fmtRp(v);
      case 'num':  return fmtNum(v);
      case 'tgl':  return fmtTgl(v);
      case 'date': return v ? fmtTgl(v) : '—'; // seperti tgl tapi '' dianggap kosong
      default:     return v == null || v === '' ? '—' : String(v);
    }
  }

  window.CekDataTable = function (opts) {
    var p = opts.prefix;
    var colSpecs = opts.columns;

    // v9: fitur didaftarkan eksplisit (sorting + global filter + pagination)
    var features = core.tableFeatures({
      coreReactivityFeature: storeReactivityBindings(),
      columnFilteringFeature: core.columnFilteringFeature,
      globalFilteringFeature: core.globalFilteringFeature,
      filteredRowModel: core.createFilteredRowModel(),
      filterFns: { includesString: core.filterFn_includesString },
      rowSortingFeature: core.rowSortingFeature,
      sortedRowModel: core.createSortedRowModel(),
      sortFns: {
        alphanumeric: core.sortFn_alphanumeric,
        basic: core.sortFn_basic,
        datetime: core.sortFn_datetime
      },
      rowPaginationFeature: core.rowPaginationFeature,
      paginatedRowModel: core.createPaginatedRowModel()
    });

    var helper = core.createColumnHelper(features);
    var columns = helper.columns(colSpecs.map(function (c) {
      var def = { header: c.header };
      if (c.sortFn) def.sortFn = c.sortFn;
      return helper.accessor(c.id, def);
    }));

    var table = core.constructTable({
      features: features,
      columns: columns,
      data: opts.data,
      getRowId: function (row) { return String(opts.rowId ? opts.rowId(row) : row.id); },
      globalFilterFn: 'includesString',
      initialState: { pagination: { pageIndex: 0, pageSize: opts.pageSize || 10 } }
    });

    var specById = {};
    colSpecs.forEach(function (c) { specById[c.id] = c; });

    // Badge jumlah baris yang perlu dicek
    if (opts.flag) {
      var flagged = opts.data.filter(opts.flag).length;
      var flagEl = document.getElementById(p + '-flag');
      if (flagEl) {
        flagEl.textContent = flagged > 0
          ? ('⚠️ ' + flagged + ' baris perlu dicek')
          : '✅ Semua baris tampak rapi';
      }
    }

    function renderHead() {
      var head = document.getElementById(p + '-head');
      head.innerHTML = '';
      table.getFlatHeaders().forEach(function (header) {
        var col = header.column;
        var th = document.createElement('th');
        th.textContent = col.columnDef.header;
        var arrow = document.createElement('span');
        arrow.className = 'cd-sort';
        var sorted = col.getIsSorted();
        arrow.textContent = sorted === 'asc' ? '▲' : sorted === 'desc' ? '▼' : '↕';
        th.appendChild(arrow);
        th.addEventListener('click', function () { col.toggleSorting(); });
        head.appendChild(th);
      });
    }

    function renderBody() {
      var body = document.getElementById(p + '-body');
      body.innerHTML = '';
      var rows = table.getRowModel().rows;
      if (rows.length === 0) {
        var tr = document.createElement('tr');
        var td = document.createElement('td');
        td.colSpan = table.getFlatHeaders().length;
        td.className = 'cd-empty-msg';
        td.textContent = 'Tidak ada data yang cocok 🔍';
        tr.appendChild(td);
        body.appendChild(tr);
        return;
      }
      rows.forEach(function (row) {
        var tr = document.createElement('tr');
        table.getFlatHeaders().forEach(function (header) {
          var colId = header.column.id;
          var spec = specById[colId] || {};
          var td = document.createElement('td');
          if (spec.type === 'num' || spec.type === 'rp') td.classList.add('cd-num');
          if (spec.cellClass) {
            var extra = spec.cellClass(row.original);
            if (extra) td.classList.add(extra);
          }
          if (spec.render) {
            // Render kustom (link, badge, dsb) — callback mengembalikan node
            var node = spec.render(row.getValue(colId), row.original);
            if (node) td.appendChild(node); else td.textContent = '—';
          } else if (spec.type === 'badge') {
            var cls = spec.badgeClass ? spec.badgeClass(row.original) : 'pending';
            var text = spec.badgeText ? spec.badgeText(row.original) : row.getValue(colId);
            if (text) {
              var chip = document.createElement('span');
              chip.className = 'cd-chip ' + cls;
              chip.textContent = text;
              td.appendChild(chip);
            } else {
              td.textContent = '—';
            }
          } else {
            td.textContent = fmtValue(spec, row.getValue(colId));
          }
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
    }

    function renderPager() {
      var state = table.store.state;
      var total = table.getFilteredRowModel().rows.length;
      var pageSize = state.pagination.pageSize;
      var start = total === 0 ? 0 : state.pagination.pageIndex * pageSize + 1;
      var end = Math.min(total, (state.pagination.pageIndex + 1) * pageSize);
      document.getElementById(p + '-info').textContent =
        'Menampilkan ' + start + '–' + end + ' dari ' + total + ' baris';
      document.getElementById(p + '-prev').disabled = !table.getCanPreviousPage();
      document.getElementById(p + '-next').disabled = !table.getCanNextPage();
    }

    function renderAll() { renderHead(); renderBody(); renderPager(); }

    // ===== Filter per kolom (dropdown nilai unik untuk kolom filterable) =====
    // Opsi dropdown di-render sekali dari data awal (set halaman ini view-only);
    // filter bekerja lewat columnFilteringFeature + createFilteredRowModel.
    (function () {
      var filterEl = document.getElementById(p + '-filters');
      if (!filterEl) return;
      var specs = colSpecs.filter(function (c) { return c.filterable; });
      if (specs.length === 0) return;

      var resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'cd-filter-reset';
      resetBtn.innerHTML = '<i data-lucide="x"></i> Reset Filter';
      resetBtn.style.display = 'none';
      var updateReset = function () {
        resetBtn.style.display = (table.store.state.columnFilters || []).length > 0 ? '' : 'none';
      };
      resetBtn.addEventListener('click', function () {
        table.resetColumnFilters();
        filterEl.querySelectorAll('select').forEach(function (s) { s.value = ''; });
        if (table.store.state.pagination.pageIndex !== 0) table.setPageIndex(0);
        renderBody(); renderPager(); updateReset();
      });

      specs.forEach(function (c) {
        var seen = {};
        opts.data.forEach(function (r) {
          var v = r[c.id];
          if (v == null || v === '') return;
          seen[String(v)] = true;
        });
        var values = Object.keys(seen).sort(function (a, b) {
          return a.localeCompare(b, 'id');
        });
        if (values.length === 0) return;

        var col = table.getColumn(c.id);
        var wrap = document.createElement('span');
        wrap.className = 'cd-filter';
        var label = document.createElement('span');
        label.className = 'cd-filter-label';
        label.textContent = c.header;
        var sel = document.createElement('select');
        sel.className = 'cd-filter-select';
        sel.setAttribute('aria-label', 'Filter ' + c.header);
        var all = document.createElement('option');
        all.value = '';
        all.textContent = 'Semua';
        sel.appendChild(all);
        values.forEach(function (v) {
          var o = document.createElement('option');
          o.value = v;
          o.textContent = v;
          sel.appendChild(o);
        });
        sel.addEventListener('change', function () {
          var v = sel.value;
          col.setFilterValue(v === '' ? undefined : v);
          if (table.store.state.pagination.pageIndex !== 0) table.setPageIndex(0);
          renderBody(); renderPager(); updateReset();
        });
        wrap.appendChild(label);
        wrap.appendChild(sel);
        filterEl.appendChild(wrap);
      });

      filterEl.appendChild(resetBtn);
      updateReset();
    })();

    document.getElementById(p + '-global').addEventListener('input', function (e) {
      table.setGlobalFilter(e.target.value);
      renderBody(); renderPager();
    });
    document.getElementById(p + '-prev').addEventListener('click', function () {
      table.previousPage(); renderBody(); renderPager();
    });
    document.getElementById(p + '-next').addEventListener('click', function () {
      table.nextPage(); renderBody(); renderPager();
    });
    // Klik header = toggleSorting() di listener tiap <th> (dibuat di renderHead).
    // Karena sorting mengubah isi, re-render dilakukan lewat satu listener
    // delegation di container <thead>-nya (listener ini tetap hidup walau
    // isi innerHTML diganti).
    document.getElementById(p + '-head').addEventListener('click', function () {
      renderBody(); renderPager(); renderHead();
    });

    renderAll();
    return table;
  };
})();
