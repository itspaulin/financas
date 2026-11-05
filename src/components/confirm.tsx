import Ionicons from '@expo/vector-icons/Ionicons';
import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { radius, space, useColors, useIsDesktop } from '@/lib/theme';

import { Button, Txt } from './ui';

type Request = { title: string; message: string; action: string; danger?: boolean };
type Ask = (request: Request) => Promise<boolean>;

const ConfirmContext = createContext<Ask | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const c = useColors();
  const desktop = useIsDesktop();
  const [request, setRequest] = useState<Request | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback<Ask>(
    (next) =>
      new Promise((resolve) => {
        resolver.current = resolve;
        setRequest(next);
      }),
    [],
  );

  const close = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Modal transparent visible={request !== null} animationType="fade" onRequestClose={() => close(false)}>
        <Pressable
          style={[styles.overlay, { backgroundColor: c.overlay }, desktop && { justifyContent: 'center', alignItems: 'center' }]}
          onPress={() => close(false)}>
          {request && (
            <Pressable
              onPress={() => {}}
              style={[styles.sheet, { backgroundColor: c.surface }, desktop && styles.dialog]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                {request.danger !== false && (
                  <View style={[styles.icon, { backgroundColor: c.errBg }]}>
                    <Ionicons name="warning-outline" size={22} color={c.err} />
                  </View>
                )}
                <Txt size={20} weight={700} style={{ flex: 1 }}>
                  {request.title}
                </Txt>
              </View>
              <Txt size={15} color={c.text2}>
                {request.message}
              </Txt>
              <View style={{ gap: 10 }}>
                <Button
                  title={request.action}
                  variant={request.danger === false ? 'primary' : 'danger'}
                  onPress={() => close(true)}
                />
                <Button title="Cancelar" variant="outline" onPress={() => close(false)} />
              </View>
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error('useConfirm outside ConfirmProvider');
  return ask;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 28, gap: space.lg },
  dialog: { borderRadius: radius.xl, width: 440 },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
