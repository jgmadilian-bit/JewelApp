import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Field, Label, Pill } from '@/src/components/ui';
import { createListing } from '@/src/lib/api';
import { useAuth } from '@/src/lib/auth';
import { parseCertificate } from '@/src/lib/ocr';
import { fileToBase64, uploadToBucket } from '@/src/lib/storage';
import { colors, font, radius, spacing } from '@/src/theme';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'ILS', 'HKD', 'INR'];

interface Form {
  title: string;
  stone_type: string;
  shape: string;
  carat: string;
  color: string;
  clarity: string;
  cut: string;
  measurements: string;
  lab: string;
  cert_number: string;
}

const EMPTY: Form = {
  title: '',
  stone_type: '',
  shape: '',
  carat: '',
  color: '',
  clarity: '',
  cut: '',
  measurements: '',
  lab: '',
  cert_number: '',
};

export default function NewListing() {
  const { group } = useLocalSearchParams<{ group: string }>();
  const groupId = group as string;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();

  const [certUri, setCertUri] = useState<string | null>(null);
  const [certMime, setCertMime] = useState<string>('image/jpeg');
  const [photos, setPhotos] = useState<string[]>([]);
  const [form, setForm] = useState<Form>(EMPTY);
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [parsing, setParsing] = useState(false);
  const [usedMock, setUsedMock] = useState(false);
  const [posting, setPosting] = useState(false);

  const set = (key: keyof Form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const runOcr = async (base64: string, mimeType: string) => {
    setParsing(true);
    try {
      const p = await parseCertificate(base64, mimeType);
      setForm({
        title: p.title ?? '',
        stone_type: p.stone_type ?? '',
        shape: p.shape ?? '',
        carat: p.carat != null ? String(p.carat) : '',
        color: p.color ?? '',
        clarity: p.clarity ?? '',
        cut: p.cut ?? '',
        measurements: p.measurements ?? '',
        lab: p.lab ?? '',
        cert_number: p.cert_number ?? '',
      });
      setUsedMock(Boolean(p.mock));
    } catch (err) {
      Alert.alert('Could not read certificate', err instanceof Error ? err.message : 'Try another image.');
    } finally {
      setParsing(false);
    }
  };

  const captureCert = async (source: 'camera' | 'library') => {
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow access to add a certificate image.');
      return;
    }
    const opts = { mediaTypes: ['images'] as ImagePicker.MediaType[], base64: true, quality: 0.6 };
    const res =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    setCertUri(asset.uri);
    setCertMime(asset.mimeType ?? 'image/jpeg');
    if (asset.base64) await runOcr(asset.base64, asset.mimeType ?? 'image/jpeg');
  };

  const captureCertDoc = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    setCertUri(asset.uri);
    setCertMime(asset.mimeType ?? 'application/pdf');
    const base64 = await fileToBase64(asset.uri);
    await runOcr(base64, asset.mimeType ?? 'application/pdf');
  };

  const chooseCert = () => {
    Alert.alert('Add certificate', 'OCR will autofill the stone details.', [
      { text: 'Scan with camera', onPress: () => void captureCert('camera') },
      { text: 'Choose photo', onPress: () => void captureCert('library') },
      { text: 'Upload PDF / file', onPress: () => void captureCertDoc() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const addPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to attach stone images.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 6,
      quality: 0.6,
    });
    if (res.canceled) return;
    setPhotos((prev) => [...prev, ...res.assets.map((a) => a.uri)].slice(0, 6));
  };

  const post = async () => {
    if (!userId) return;
    const priceNum = price.trim() ? Number(price.replace(/[^0-9.]/g, '')) : null;
    if (priceNum == null || Number.isNaN(priceNum)) {
      Alert.alert('Add a price', 'Enter your asking price before posting.');
      return;
    }
    if (!form.title.trim() && photos.length === 0 && !certUri) {
      Alert.alert('Add some detail', 'Scan a certificate or add at least a photo and title.');
      return;
    }

    setPosting(true);
    try {
      const photoUrls: string[] = [];
      for (const uri of photos) {
        photoUrls.push(await uploadToBucket(uri, { userId, kind: 'photo' }));
      }
      let certificateUrl: string | null = null;
      if (certUri) {
        certificateUrl = await uploadToBucket(certUri, { userId, kind: 'cert', mimeType: certMime });
      }

      await createListing({
        group_id: groupId,
        seller_id: userId,
        title: form.title.trim() || form.stone_type.trim() || 'Stone',
        price: priceNum,
        currency,
        photos: photoUrls,
        certificate_url: certificateUrl,
        stone_type: form.stone_type.trim() || null,
        shape: form.shape.trim() || null,
        carat: form.carat.trim() ? Number(form.carat) : null,
        color: form.color.trim() || null,
        clarity: form.clarity.trim() || null,
        cut: form.cut.trim() || null,
        measurements: form.measurements.trim() || null,
        lab: form.lab.trim() || null,
        cert_number: form.cert_number.trim() || null,
      });

      router.back(); // dismiss modal; the feed updates live underneath
    } catch (err) {
      Alert.alert('Could not post', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(28), gap: spacing(5) }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Certificate scan — the speed unlock */}
        <Pressable onPress={chooseCert} style={styles.scanZone}>
          {certUri ? (
            <Image source={{ uri: certUri }} style={styles.certPreview} contentFit="cover" />
          ) : (
            <>
              <Text style={styles.scanGlyph}>⌖</Text>
              <Text style={styles.scanTitle}>Scan certificate</Text>
              <Text style={styles.scanSub}>OCR autofills every stone detail</Text>
            </>
          )}
          {parsing ? (
            <View style={styles.parseOverlay}>
              <ActivityIndicator color={colors.gold} />
              <Text style={styles.parseText}>Reading certificate…</Text>
            </View>
          ) : null}
        </Pressable>

        {certUri && !parsing ? (
          <Pressable onPress={chooseCert}>
            <Text style={styles.replace}>Replace certificate</Text>
          </Pressable>
        ) : null}

        {usedMock ? (
          <View style={styles.mockNote}>
            <Text style={styles.mockText}>
              Showing sample data — set ANTHROPIC_API_KEY on the parse-certificate function for real
              OCR. Edit anything below.
            </Text>
          </View>
        ) : null}

        {/* Photos */}
        <View style={{ gap: spacing(2) }}>
          <Label>Stone photos</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing(3) }}>
            {photos.map((uri) => (
              <Image key={uri} source={{ uri }} style={styles.photo} contentFit="cover" />
            ))}
            <Pressable onPress={addPhotos} style={styles.addPhoto}>
              <Text style={styles.addPhotoGlyph}>＋</Text>
            </Pressable>
          </ScrollView>
        </View>

        {/* Price */}
        <View style={{ gap: spacing(2) }}>
          <Label>Asking price</Label>
          <View style={{ flexDirection: 'row', gap: spacing(3) }}>
            <Field
              value={price}
              onChangeText={setPrice}
              placeholder="0"
              keyboardType="numeric"
              style={{ flex: 1 }}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing(2) }}>
            {CURRENCIES.map((c) => (
              <Pressable
                key={c}
                onPress={() => setCurrency(c)}
                style={[styles.curr, currency === c && styles.currActive]}
              >
                <Text style={[styles.currText, currency === c && styles.currTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Details (autofilled, editable) */}
        <View style={{ gap: spacing(4) }}>
          <Field label="Title" value={form.title} onChangeText={set('title')} placeholder="1.52ct Round Brilliant D VS1" />
          <View style={styles.grid}>
            <Field label="Carat" value={form.carat} onChangeText={set('carat')} placeholder="1.52" keyboardType="numeric" style={styles.gridItem} />
            <Field label="Shape" value={form.shape} onChangeText={set('shape')} placeholder="Round" style={styles.gridItem} />
            <Field label="Color" value={form.color} onChangeText={set('color')} placeholder="D" autoCapitalize="characters" style={styles.gridItem} />
            <Field label="Clarity" value={form.clarity} onChangeText={set('clarity')} placeholder="VS1" autoCapitalize="characters" style={styles.gridItem} />
            <Field label="Cut" value={form.cut} onChangeText={set('cut')} placeholder="Excellent" style={styles.gridItem} />
            <Field label="Lab" value={form.lab} onChangeText={set('lab')} placeholder="GIA" autoCapitalize="characters" style={styles.gridItem} />
          </View>
          <Field label="Measurements" value={form.measurements} onChangeText={set('measurements')} placeholder="7.42 - 7.46 x 4.58 mm" />
          <Field label="Certificate #" value={form.cert_number} onChangeText={set('cert_number')} placeholder="2231457890" autoCapitalize="characters" />
        </View>
      </ScrollView>

      <View style={[styles.postBar, { paddingBottom: insets.bottom + spacing(3) }]}>
        <Button title="Post to group" onPress={post} loading={posting} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scanZone: {
    height: 180,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.borderHi,
    borderStyle: 'dashed',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  scanGlyph: { fontSize: 44, color: colors.gold },
  scanTitle: { ...font.h3, color: colors.text, marginTop: spacing(2) },
  scanSub: { ...font.small, color: colors.textMuted, marginTop: spacing(1) },
  certPreview: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  parseOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(11,11,15,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(2),
  },
  parseText: { ...font.small, color: colors.goldSoft },
  replace: { ...font.small, color: colors.goldSoft, textAlign: 'center' },
  mockNote: {
    backgroundColor: 'rgba(212,175,55,0.1)',
    borderColor: colors.goldDeep,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing(3.5),
  },
  mockText: { ...font.small, color: colors.goldSoft },

  photo: { width: 84, height: 84, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  addPhoto: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.borderHi,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoGlyph: { fontSize: 28, color: colors.textMuted },

  curr: {
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(2),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  currActive: { backgroundColor: colors.surfaceHi, borderColor: colors.gold },
  currText: { ...font.small, color: colors.textMuted },
  currTextActive: { color: colors.goldSoft, fontWeight: '600' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(3) },
  gridItem: { width: '47%', flexGrow: 1 },

  postBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing(4),
    paddingTop: spacing(3),
    backgroundColor: 'rgba(11,11,15,0.94)',
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
});
