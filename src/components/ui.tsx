import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, type ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatDate, formatMoney, formatMonth, parseDate } from '@/lib/format';
import { fonts, type Palette, radius, shadow, space, useColors, type Weight } from '@/lib/theme';
import { today } from '@/shared/dates';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Txt({
  children,
  weight = 500,
  size = 15,
  color,
  numeric,
  style,
  numberOfLines,
  selectable,
}: {
  children: ReactNode;
  weight?: Weight;
  size?: number;
  color?: string;
  numeric?: boolean;
  style?: TextStyle | TextStyle[];
  numberOfLines?: number;
  selectable?: boolean;
}) {
  const c = useColors();
  return (
    <Text
      numberOfLines={numberOfLines}
      selectable={selectable}
      style={[
        {
          fontFamily: fonts[weight],
          fontSize: size,
          lineHeight: Math.round(size * 1.38),
          color: color ?? c.text,
          letterSpacing: size >= 20 ? -0.3 : 0,
        },
        numeric && { fontVariant: ['tabular-nums'] },
        style,
      ]}>
      {children}
    </Text>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.between}>
      <Txt size={13} weight={700} color={c.text2} style={{ textTransform: 'uppercase', letterSpacing: 0.3 }}>
        {children}
      </Txt>
      {right}
    </View>
  );
}

export function Screen({
  children,
  scroll = true,
  footer,
  edges = ['top'],
}: {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  edges?: ('top' | 'bottom')[];
}) {
  const c = useColors();
  const content = <View style={styles.content}>{children}</View>;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: footer ? 24 : 120 }}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
      {footer && (
        <View style={[styles.footer, { borderTopColor: c.line, backgroundColor: c.bg }]}>{footer}</View>
      )}
    </SafeAreaView>
  );
}

export function ScreenHeader({ title, icon = 'close', onBack }: { title: string; icon?: IconName; onBack: () => void }) {
  return (
    <View style={styles.screenHeader}>
      <IconButton icon={icon} label="Voltar" onPress={onBack} />
      <Txt size={20} weight={700} style={{ flex: 1 }}>
        {title}
      </Txt>
    </View>
  );
}

type CardTone = 'default' | 'pending' | 'ok' | 'primary';

export function Card({
  children,
  tone = 'default',
  flat,
  style,
  padded = true,
}: {
  children: ReactNode;
  tone?: CardTone;
  flat?: boolean;
  style?: ViewStyle | ViewStyle[];
  padded?: boolean;
}) {
  const c = useColors();
  const border =
    tone === 'pending'
      ? { borderWidth: 2, borderColor: c.warnBorder }
      : tone === 'ok'
        ? { borderWidth: 2, borderColor: c.okBar }
        : { borderWidth: 1, borderColor: c.line };
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: tone === 'primary' ? c.primaryBg : c.surface },
        tone === 'primary' ? { borderWidth: 0 } : border,
        !flat && tone !== 'primary' && shadow(c),
        padded && { padding: space.lg },
        style,
      ]}>
      {children}
    </View>
  );
}

export type StatTone = 'default' | 'income' | 'warn' | 'balance';

export function Stat({
  label,
  cents,
  tone = 'default',
  icon,
  footer,
}: {
  label: string;
  cents: number;
  tone?: StatTone;
  icon?: IconName;
  footer?: ReactNode;
}) {
  const c = useColors();
  const negative = cents < 0;
  const tinted = tone === 'balance';
  const bg = tinted ? (negative ? c.errBg : c.okBg) : c.surface;
  const valueColor =
    tone === 'income' ? c.ok : tone === 'warn' ? c.warn : tinted ? (negative ? c.err : c.ok) : c.text;
  return (
    <View style={[styles.stat, { backgroundColor: bg, borderColor: tinted ? 'transparent' : c.line }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {icon && <Ionicons name={icon} size={13} color={c.text2} />}
        <Txt size={13} color={c.text2}>
          {label}
        </Txt>
      </View>
      <Txt size={21} weight={800} color={valueColor} numeric numberOfLines={1}>
        {formatMoney(cents)}
      </Txt>
      {footer}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled,
  loading,
  full,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  full?: boolean;
}) {
  const c = useColors();
  const look: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: c.primary, fg: c.onPrimary, border: 'transparent' },
    secondary: { bg: c.primaryBg, fg: c.primaryText, border: 'transparent' },
    outline: { bg: 'transparent', fg: c.text, border: c.line },
    danger: { bg: c.errBg, fg: c.err, border: c.err },
  };
  const { bg, fg, border } = look[variant];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && styles.buttonSm,
        full && { alignSelf: 'stretch' },
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <Txt size={size === 'sm' ? 14 : 15} weight={700} color={fg} numberOfLines={1}>
            {title}
          </Txt>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  label,
  bordered,
  size = 48,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  bordered?: boolean;
  size?: number;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconButton,
        { width: size, height: size, opacity: pressed ? 0.7 : 1 },
        bordered && { backgroundColor: c.surface, borderWidth: 1, borderColor: c.line },
      ]}>
      <Ionicons name={icon} size={22} color={c.text} />
    </Pressable>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <Txt size={13} weight={600} color={c.text2} style={{ marginBottom: 6 }}>
      {children}
    </Txt>
  );
}

function Hint({ children, tone }: { children: ReactNode; tone?: 'warn' }) {
  const c = useColors();
  return (
    <Txt size={13} weight={tone ? 600 : 500} color={tone ? c.warn : c.text3} style={{ marginTop: 6 }}>
      {children}
    </Txt>
  );
}

export function inputStyle(c: Palette, highlight?: boolean): TextStyle {
  return {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: highlight ? c.warnBorder : c.line,
    backgroundColor: highlight ? c.warnBg : c.surface,
    color: c.text,
    fontFamily: fonts[500],
    fontSize: 16,
    paddingHorizontal: 14,
  };
}

export function Field({
  label,
  icon,
  highlight,
  hint,
  warn,
  style,
  ...props
}: TextInputProps & { label?: string; icon?: IconName; highlight?: boolean; hint?: string; warn?: string }) {
  const c = useColors();
  return (
    <View>
      {label && <FieldLabel>{label}</FieldLabel>}
      <View style={{ justifyContent: 'center' }}>
        {icon && <Ionicons name={icon} size={18} color={c.text3} style={{ position: 'absolute', left: 14, zIndex: 1 }} />}
        <TextInput
          placeholderTextColor={c.text3}
          {...props}
          style={[inputStyle(c, highlight), icon && { paddingLeft: 42 }, props.multiline && { paddingVertical: 12 }, style]}
        />
      </View>
      {warn ? <Hint tone="warn">{warn}</Hint> : hint ? <Hint>{hint}</Hint> : null}
    </View>
  );
}

export function MoneyField({
  label,
  cents,
  onChange,
  highlight,
  warn,
  compact,
}: {
  label?: string;
  cents: number | null;
  onChange: (cents: number | null) => void;
  highlight?: boolean;
  warn?: string;
  compact?: boolean;
}) {
  const c = useColors();
  return (
    <View>
      {label && <FieldLabel>{label}</FieldLabel>}
      <TextInput
        value={cents ? formatMoney(cents) : ''}
        placeholder="R$ 0,00"
        placeholderTextColor={c.text3}
        keyboardType="number-pad"
        inputMode="numeric"
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, '').slice(0, 10);
          onChange(digits ? Number(digits) : null);
        }}
        style={[
          inputStyle(c, highlight),
          compact
            ? { minHeight: 44, fontSize: 15 }
            : { minHeight: 64, fontSize: 28, fontFamily: fonts[800], letterSpacing: -0.5 },
          { fontVariant: ['tabular-nums'] },
        ]}
      />
      {warn && <Hint tone="warn">{warn}</Hint>}
    </View>
  );
}

function yesterday(): string {
  const d = new Date(`${today()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (iso: string) => void }) {
  const [text, setText] = useState(formatDate(value));
  const set = (iso: string) => {
    setText(formatDate(iso));
    onChange(iso);
  };
  const options = [
    { value: today(), label: 'Hoje' },
    { value: yesterday(), label: 'Ontem' },
  ];
  return (
    <View style={{ gap: space.sm }}>
      <Field
        label={label}
        icon="calendar-outline"
        value={text}
        placeholder="DD/MM/AAAA"
        keyboardType="numbers-and-punctuation"
        highlight={parseDate(text) === null}
        onChangeText={(t) => {
          setText(t);
          const iso = parseDate(t);
          if (iso) onChange(iso);
        }}
      />
      <Chips options={options} value={options.find((o) => o.value === value)?.value ?? null} onChange={(v) => v && set(v)} />
    </View>
  );
}

export function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
  highlight,
  warn,
  allowNone,
  small,
}: {
  label?: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
  highlight?: boolean;
  warn?: string;
  allowNone?: string;
  small?: boolean;
}) {
  const c = useColors();
  const all: { value: T | null; label: string }[] = allowNone ? [{ value: null, label: allowNone }, ...options] : options;
  return (
    <View>
      {label && <FieldLabel>{label}</FieldLabel>}
      <View
        style={[
          styles.chips,
          highlight && {
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: c.warnBorder,
            backgroundColor: c.warnBg,
            borderRadius: radius.lg,
            padding: space.sm,
          },
        ]}>
        {all.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value ?? '__none'}
              onPress={() => onChange(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[
                styles.chip,
                small && { minHeight: 36, paddingHorizontal: 12 },
                {
                  backgroundColor: selected ? c.primaryBg : c.surface,
                  borderColor: selected ? c.primary : c.line,
                },
              ]}>
              <Txt size={14} weight={selected ? 700 : 600} color={selected ? c.primaryText : c.text2}>
                {option.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
      {warn && highlight && <Hint tone="warn">{warn}</Hint>}
    </View>
  );
}

export function Switch({ value }: { value: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.switch, { backgroundColor: value ? c.primary : c.off }]}>
      <View style={[styles.knob, { left: value ? 24 : 4, backgroundColor: value ? c.onPrimary : '#fff' }]} />
    </View>
  );
}

export function SwitchRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={[styles.switchRow, { backgroundColor: c.surface, borderColor: c.line }]}>
      <View style={{ flex: 1 }}>
        <Txt size={15} weight={600}>
          {label}
        </Txt>
        {hint && (
          <Txt size={13} color={c.text3}>
            {hint}
          </Txt>
        )}
      </View>
      <Switch value={value} />
    </Pressable>
  );
}

export type Tone = 'primary' | 'warn' | 'error' | 'ok' | 'muted';

function toneColors(c: Palette, tone: Tone) {
  return {
    primary: { bg: c.primaryBg, fg: c.primaryText, border: c.primary },
    warn: { bg: c.warnBg, fg: c.warn, border: c.warnBorder },
    error: { bg: c.errBg, fg: c.err, border: c.err },
    ok: { bg: c.okBg, fg: c.ok, border: c.okBar },
    muted: { bg: c.surface2, fg: c.text2, border: c.line },
  }[tone];
}

export function Tag({ children, tone = 'muted' }: { children: ReactNode; tone?: Tone }) {
  const c = useColors();
  const t = toneColors(c, tone);
  return (
    <View style={[styles.tag, { backgroundColor: t.bg }]}>
      <Txt size={12} weight={700} color={t.fg}>
        {children}
      </Txt>
    </View>
  );
}

export function Note({ children, tone = 'primary', icon }: { children: ReactNode; tone?: Tone; icon?: IconName }) {
  const c = useColors();
  const t = toneColors(c, tone);
  const bordered = tone === 'warn' || tone === 'error';
  const defaultIcon: IconName = tone === 'ok' ? 'checkmark' : tone === 'primary' ? 'information-circle-outline' : 'alert-circle-outline';
  return (
    <View style={[styles.note, { backgroundColor: t.bg }, bordered && { borderWidth: 1.5, borderColor: t.border }]}>
      <Ionicons name={icon ?? defaultIcon} size={18} color={t.fg} style={{ marginTop: 1 }} />
      <Txt size={14} weight={600} color={t.fg} style={{ flex: 1 }}>
        {children}
      </Txt>
    </View>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <Note tone="error">{children}</Note>;
}

export function barTone(ratio: number): 'ok' | 'warn' | 'error' {
  return ratio > 1 ? 'error' : ratio > 0.85 ? 'warn' : 'ok';
}

export function ProgressBar({ ratio, tone, thin }: { ratio: number; tone?: 'ok' | 'warn' | 'error' | 'primary'; thin?: boolean }) {
  const c = useColors();
  const t = tone ?? barTone(ratio);
  const color = { ok: c.okBar, warn: c.warnBar, error: c.errBar, primary: c.primary }[t];
  return (
    <View style={[styles.track, { backgroundColor: c.surface2, height: thin ? 8 : 10 }]}>
      <View style={{ width: `${Math.max(0, Math.min(ratio, 1)) * 100}%`, backgroundColor: color, height: '100%', borderRadius: 99 }} />
    </View>
  );
}

export function MonthSwitcher({ month, onShift, compact }: { month: string; onShift: (delta: number) => void; compact?: boolean }) {
  const c = useColors();
  if (compact) {
    return (
      <View style={[styles.monthCompact, { borderColor: c.line, backgroundColor: c.surface }]}>
        <IconButton icon="chevron-back" label="Mês anterior" onPress={() => onShift(-1)} size={40} />
        <Txt size={15} weight={700} style={{ minWidth: 120, textAlign: 'center' }}>
          {formatMonth(month)}
        </Txt>
        <IconButton icon="chevron-forward" label="Próximo mês" onPress={() => onShift(1)} size={40} />
      </View>
    );
  }
  return (
    <View style={styles.between}>
      <IconButton icon="chevron-back" label="Mês anterior" onPress={() => onShift(-1)} bordered size={44} />
      <Txt size={20} weight={800}>
        {formatMonth(month)}
      </Txt>
      <IconButton icon="chevron-forward" label="Próximo mês" onPress={() => onShift(1)} bordered size={44} />
    </View>
  );
}

export function Skeleton({ height = 16, width = '100%', r = radius.sm }: { height?: number; width?: number | `${number}%`; r?: number }) {
  const c = useColors();
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={{ height, width, borderRadius: r, backgroundColor: c.surface2, opacity }} />;
}

export function EmptyState({ icon = 'list', title, text }: { icon?: IconName; title: string; text?: string }) {
  const c = useColors();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: c.surface2 }]}>
        <Ionicons name={icon} size={32} color={c.text3} />
      </View>
      <Txt size={16} weight={700} style={{ textAlign: 'center' }}>
        {title}
      </Txt>
      {text && (
        <Txt size={14} color={c.text3} style={{ textAlign: 'center', maxWidth: 300 }}>
          {text}
        </Txt>
      )}
    </View>
  );
}

export function Spinner() {
  const c = useColors();
  return <ActivityIndicator style={{ marginVertical: space.xl }} color={c.primary} />;
}

export function Avatar({ name }: { name: string }) {
  const c = useColors();
  return (
    <View style={[styles.avatar, { backgroundColor: c.primaryBg }]}>
      <Txt size={15} weight={800} color={c.primaryText}>
        {name.slice(0, 1).toUpperCase()}
      </Txt>
    </View>
  );
}

export function PaidToggle({ paid, onPress, disabled }: { paid: boolean; onPress: () => void; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={paid ? 'Marcar como a pagar' : 'Marcar como pago'}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ hovered, pressed }) => [
        styles.paidToggle,
        { backgroundColor: paid ? c.okBg : c.warnBg, borderColor: hovered || pressed ? (paid ? c.okBar : c.warnBorder) : 'transparent' },
      ]}>
      <Ionicons name={paid ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={paid ? c.ok : c.warn} />
      <Txt size={12} weight={700} color={paid ? c.ok : c.warn}>
        {paid ? 'pago' : 'a pagar'}
      </Txt>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  paidToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1.5 },
  content: { padding: space.lg, gap: space.lg, width: '100%', maxWidth: 720, alignSelf: 'center' },
  footer: { padding: space.lg, paddingTop: space.md, borderTopWidth: 1, gap: 10 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  screenHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space.sm, paddingTop: space.sm, minHeight: 64 },
  card: { borderRadius: radius.xl, gap: space.md },
  stat: { flex: 1, flexBasis: 150, borderWidth: 1, borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: 16, gap: 4, minWidth: 150 },
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderWidth: 1.5,
  },
  buttonSm: { minHeight: 44, paddingHorizontal: 16 },
  iconButton: { borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  switch: { width: 52, height: 32, borderRadius: 99 },
  knob: { position: 'absolute', top: 4, width: 24, height: 24, borderRadius: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingHorizontal: space.lg, borderWidth: 1, borderRadius: radius.lg },
  tag: { borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start' },
  note: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md },
  track: { borderRadius: 99, overflow: 'hidden' },
  monthCompact: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 4, height: 52 },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: 48 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
