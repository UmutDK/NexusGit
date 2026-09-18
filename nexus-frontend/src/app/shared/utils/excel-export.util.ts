export interface ExcelColumn {
  header: string;
  width?: number;
}

export type ExcelCell = { type: 'String'; value: string } | { type: 'Number'; value: number };

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cellXml(cell: ExcelCell, styleId: string): string {
  const data = cell.type === 'Number' ? String(cell.value) : escapeXml(cell.value);
  return `<Cell ss:StyleID="${styleId}"><Data ss:Type="${cell.type}">${data}</Data></Cell>`;
}

/**
 * Builds a minimal single-sheet SpreadsheetML (.xls) document — no external
 * library needed, just XML that Excel opens natively. Same technique used
 * elsewhere for Excel exports without a backend round-trip.
 */
export function buildExcelWorkbook(sheetName: string, columns: ExcelColumn[], rows: ExcelCell[][]): string {
  const styles = `<Styles>
    <Style ss:ID="hdr"><Font ss:Bold="1" ss:Size="10" ss:Color="#FFFFFF"/><Interior ss:Color="#2563eb" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>
    <Style ss:ID="cell"><Font ss:Size="10"/><Alignment ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#e2e8f0"/></Borders></Style>
    <Style ss:ID="cellZ"><Font ss:Size="10"/><Interior ss:Color="#f8fafc" ss:Pattern="Solid"/><Alignment ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#e2e8f0"/></Borders></Style>
  </Styles>`;

  const columnDefs = columns.map((c) => `<Column ss:Width="${c.width ?? 120}"/>`).join('');
  const headerRow = `<Row ss:Height="22">${columns
    .map((c) => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${escapeXml(c.header)}</Data></Cell>`)
    .join('')}</Row>`;
  const dataRows = rows
    .map((row, i) => {
      const styleId = i % 2 === 1 ? 'cellZ' : 'cell';
      return `<Row ss:Height="18">${row.map((cell) => cellXml(cell, styleId)).join('')}</Row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  ${styles}
  <Worksheet ss:Name="${escapeXml(sheetName)}"><Table ss:DefaultRowHeight="18">
    ${columnDefs}
    ${headerRow}
    ${dataRows}
  </Table></Worksheet>
</Workbook>`;
}

export function downloadExcelWorkbook(xml: string, filename: string): void {
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
