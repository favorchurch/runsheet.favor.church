import React from 'react';
import path from 'path';
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  Font,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { RunsheetExportModel } from './model';

let fontsInitialized = false;

// react-pdf falls back to the next family per glyph
const EXPORT_FONT_FAMILY = ['Noto Sans', 'Noto Sans KR'];

export function initializeExportFonts(): void {
  if (fontsInitialized) return;

  const regularFont = path.join(process.cwd(), 'public/fonts/NotoSans-Regular.ttf');
  const boldFont = path.join(process.cwd(), 'public/fonts/NotoSans-Bold.ttf');
  const krRegularFont = path.join(process.cwd(), 'public/fonts/NotoSansKR-Regular.ttf');
  const krBoldFont = path.join(process.cwd(), 'public/fonts/NotoSansKR-Bold.ttf');

  Font.register({
    family: 'Noto Sans',
    fonts: [
      { src: regularFont, fontWeight: 'normal' },
      { src: boldFont, fontWeight: 'bold' },
    ],
  });

  // Per-glyph fallback for Hangul / Hanja / kana (see EXPORT_FONT_FAMILY)
  Font.register({
    family: 'Noto Sans KR',
    fonts: [
      { src: krRegularFont, fontWeight: 'normal' },
      { src: krBoldFont, fontWeight: 'bold' },
    ],
  });

  // Hyphenation callback to wrap long unbroken strings / URLs without throwing
  Font.registerHyphenationCallback((word: string) => {
    if (word.length <= 16) return [word];
    const parts: string[] = [];
    for (let i = 0; i < word.length; i += 12) {
      parts.push(word.slice(i, i + 12));
    }
    return parts;
  });

  fontsInitialized = true;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: EXPORT_FONT_FAMILY,
    fontSize: 8,
    paddingTop: 24,
    paddingBottom: 36,
    paddingHorizontal: 24,
    color: '#1e293b',
  },
  header: {
    marginBottom: 8,
  },
  titleBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderBottomWidth: 1.5,
    borderBottomColor: '#0f172a',
    paddingBottom: 5,
    marginBottom: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  meta: {
    fontSize: 8.5,
    color: '#475569',
  },
  scope: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 8,
    color: '#64748b',
    marginBottom: 4,
  },
  table: {
    width: '100%',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderTopWidth: 1,
    borderTopColor: '#cbd5e1',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
  },
  tableHeaderCell: {
    fontWeight: 'bold',
    fontSize: 7.5,
    color: '#334155',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRightWidth: 0.5,
    borderRightColor: '#cbd5e1',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#e2e8f0',
  },
  tableCell: {
    fontSize: 7.5,
    color: '#1e293b',
    paddingVertical: 3,
    paddingHorizontal: 4,
    borderRightWidth: 0.5,
    borderRightColor: '#e2e8f0',
  },
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 24,
    right: 24,
    textAlign: 'center',
    fontSize: 7.5,
    color: '#94a3b8',
  },
});

interface RunsheetPdfDocumentProps {
  model: RunsheetExportModel;
}

export function RunsheetPdfDocument({ model }: RunsheetPdfDocumentProps): React.JSX.Element {
  // Compute column widths to fit A4 landscape (available printable width ~793 pt)
  const startWidth = 65;
  const durationWidth = 55;
  const activityWidth = 140;

  const dynamicCols = model.columns.filter(
    (c) => c.key !== 'start' && c.key !== 'duration' && c.key !== 'activityTitle',
  );
  const remainingWidth = Math.max(200, 793 - (startWidth + durationWidth + activityWidth));
  const dynamicColWidth = dynamicCols.length > 0 ? remainingWidth / dynamicCols.length : remainingWidth;

  const metaParts: string[] = [];
  if (model.campus) metaParts.push(model.campus);
  if (model.date) metaParts.push(model.date);
  if (model.time) metaParts.push(model.time);
  if (model.totalDuration) metaParts.push(`Total: ${model.totalDuration}`);
  const metaString = metaParts.join(' • ');

  return (
    <Document title={model.name || 'Runsheet'}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Repeating header */}
        <View fixed style={styles.header}>
          <View style={styles.titleBar}>
            <Text wrap style={styles.title}>
              {model.title || model.name || 'Runsheet'}
            </Text>
            {metaString ? <Text wrap style={styles.meta}>{metaString}</Text> : null}
          </View>
          {model.scope ? (
            <Text wrap style={styles.scope}>
              {model.scope}
            </Text>
          ) : null}
          {model.subtitle ? (
            <Text wrap style={styles.subtitle}>
              {model.subtitle}
            </Text>
          ) : null}

          {/* Table column headers */}
          <View style={styles.tableHeaderRow}>
            <Text wrap style={[styles.tableHeaderCell, { width: startWidth }]}>
              Start
            </Text>
            <Text wrap style={[styles.tableHeaderCell, { width: durationWidth }]}>
              Duration
            </Text>
            <Text wrap style={[styles.tableHeaderCell, { width: activityWidth }]}>
              Activity Title
            </Text>
            {dynamicCols.map((col) => (
              <Text
                key={col.key}
                wrap
                style={[styles.tableHeaderCell, { width: dynamicColWidth }]}
              >
                {col.name}
              </Text>
            ))}
          </View>
        </View>

        {/* Table Rows */}
        <View style={styles.table}>
          {model.rows.map((row, idx) => (
            <View key={row.id || idx} wrap style={styles.tableRow}>
              <Text wrap style={[styles.tableCell, { width: startWidth }]}>
                {row.start}
              </Text>
              <Text wrap style={[styles.tableCell, { width: durationWidth }]}>
                {row.duration}
              </Text>
              <Text wrap style={[styles.tableCell, { width: activityWidth }]}>
                {row.activityTitle}
              </Text>
              {dynamicCols.map((col) => (
                <Text
                  key={col.key}
                  wrap
                  style={[styles.tableCell, { width: dynamicColWidth }]}
                >
                  {row.values[col.key] || ''}
                </Text>
              ))}
            </View>
          ))}
        </View>

        {/* Page numbers in footer */}
        <Text
          fixed
          style={styles.footer}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />
      </Page>
    </Document>
  );
}

/**
 * Renders a RunsheetExportModel into a PDF buffer.
 */
export async function renderRunsheetPdf(model: RunsheetExportModel): Promise<Buffer> {
  initializeExportFonts();
  return await renderToBuffer(<RunsheetPdfDocument model={model} />);
}
