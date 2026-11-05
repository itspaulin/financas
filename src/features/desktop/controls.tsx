import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type ViewStyle } from 'react-native';

import { Txt } from '@/components/ui';
import { fonts, radius, shadow, space, useColors } from '@/lib/theme';

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  allLabel,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (value: T | null) => void;
  allLabel: string;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value)?.label ?? allLabel;
  const all: { value: T | null; label: string }[] = [{ value: null, label: allLabel }, ...options];
  return (
    <View style={{ zIndex: open ? 50 : 1 }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={[styles.select, { backgroundColor: c.surface, borderColor: value ? c.primary : c.line }]}>
        <Txt size={14} color={c.text2}>
          {label} :
        </Txt>
        <Txt size={14} weight={700}>
          {current}
        </Txt>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={c.text2} />
      </Pressable>
      {open && (
        <View style={[styles.menu, { backgroundColor: c.surface, borderColor: c.line }, shadow(c)]}>
          {all.map((o) => (
            <Pressable
              key={o.value ?? '__all'}
              onPress={() => {
                onChange(o.value);
                setOpen(false);
              }}
              style={({ hovered }) => [styles.menuItem, (hovered || o.value === value) && { backgroundColor: c.surface2 }]}>
              <Txt size={14} weight={o.value === value ? 700 : 500}>
                {o.label}
              </Txt>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const c = useColors();
  return (
    <View style={[styles.segmented, { backgroundColor: c.surface2 }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on && { backgroundColor: c.surface }, on && shadow(c)]}>
            <Txt size={14} weight={on ? 700 : 500} color={on ? c.text : c.text2}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ToggleChip({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={[styles.select, { backgroundColor: value ? c.primaryBg : c.surface, borderColor: value ? c.primary : c.line }]}>
      <Txt size={14} weight={value ? 700 : 500} color={value ? c.primaryText : c.text}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const c = useColors();
  return (
    <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.line }]}>
      <Ionicons name="search" size={16} color={c.text3} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Buscar descrição"
        placeholderTextColor={c.text3}
        style={{ flex: 1, fontFamily: fonts[500], fontSize: 14, color: c.text, outlineStyle: 'none' } as object}
      />
    </View>
  );
}

export type Column = { key: string; label: string; flex?: number; width?: number; align?: 'left' | 'right' };

function cellStyle(col: Column): ViewStyle {
  return {
    flex: col.width ? undefined : (col.flex ?? 1),
    width: col.width,
    alignItems: col.align === 'right' ? 'flex-end' : 'flex-start',
    minWidth: 0,
  };
}

export function Table({
  columns,
  children,
  title,
  right,
  accent,
}: {
  columns: Column[];
  children: ReactNode;
  title?: string;
  right?: ReactNode;
  accent?: boolean;
}) {
  const c = useColors();
  return (
    <View style={[styles.table, { backgroundColor: c.surface, borderColor: accent ? c.primary : c.line }]}>
      {title && (
        <View style={styles.tableTitle}>
          <Txt size={19} weight={700}>
            {title}
          </Txt>
          {right}
        </View>
      )}
      <View style={[styles.thead, { backgroundColor: c.surface2, borderColor: c.line }]}>
        {columns.map((col) => (
          <View key={col.key} style={cellStyle(col)}>
            <Txt size={12} weight={700} color={c.text2} style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>
              {col.label}
            </Txt>
          </View>
        ))}
      </View>
      {children}
    </View>
  );
}

export function Row({
  columns,
  cells,
  onPress,
  selected,
  tint,
}: {
  columns: Column[];
  cells: Record<string, ReactNode>;
  onPress?: () => void;
  selected?: boolean;
  tint?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ hovered }) => [
        styles.tr,
        { borderTopColor: c.line },
        tint ? { backgroundColor: tint } : null,
        hovered && onPress ? { backgroundColor: c.surface2 } : null,
        selected ? { backgroundColor: c.primaryBg } : null,
      ]}>
      {columns.map((col) => (
        <View key={col.key} style={cellStyle(col)}>
          {cells[col.key]}
        </View>
      ))}
    </Pressable>
  );
}

export function GroupRow({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <View style={[styles.group, { backgroundColor: c.bg, borderTopColor: c.line }]}>
      <Txt size={13} weight={700} color={c.text2}>
        {children}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  select: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1.5 },
  menu: { position: 'absolute', top: 48, left: 0, minWidth: 220, borderWidth: 1, borderRadius: radius.md, paddingVertical: 6, maxHeight: 360, overflow: 'scroll' as 'hidden' },
  menuItem: { paddingHorizontal: 14, paddingVertical: 10 },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  segment: { paddingHorizontal: 16, minHeight: 38, justifyContent: 'center', borderRadius: 11 },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1.5, width: 260 },
  table: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  tableTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md },
  thead: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: space.lg, minHeight: 44 },
  tr: { flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingHorizontal: space.lg, minHeight: 52, paddingVertical: 8, borderTopWidth: 1 },
  group: { paddingHorizontal: space.lg, paddingVertical: 8, borderTopWidth: 1 },
});
