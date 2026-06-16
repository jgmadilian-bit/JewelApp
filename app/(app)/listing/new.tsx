import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Field, Label } from '@/src/components/ui';
import { createListing } from '@/src/lib/api';
import { useAuth } from '@/src/lib/auth';
import { parseCaption } from '@/src/lib/captionParser';
import { OcrUnavailableError, recognizeAndParseCertificate } from '@/src/lib/ocr';
import { uploadToBucket } from '@/src/lib/storage';
import type { Gemstone, ParsedListing, WeightUnit } from '@/src/lib/types';
import { colors, font, radius, spacing } from '@/src/theme';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'ILS', 'HKD', 'INR'];

const CAPTION_PLACEHOLDER =
  'Type it like you’d post in the group, e.g.\n“18K yellow gold ring, 5.2g, 1.05ct round G VS1, sz 6.5, $4,200 shipped”';

interface Form {
  title: string;
  category: string;
  metal: string;
  gross_weight: string;
  weight_unit: WeightUnit;
  ring_size: string;
  item_length: string;
  era: string;
  condition: string;
  total_carat: string;
  price_terms: string;
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
  category: '',
  metal: '',
  gross_weight: '',
  weight_unit: 'g',
  ring_size: '',
  item_length: '',
  era: '',
  condition: '',
  total_carat: '',
  price_terms: '',
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

const num = (s: string): number | null => {
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return s.trim() && Number.isFinite(n) ? n : null;
};

function gemLabel(g: Gemstone): string {
  const ct =
    g.carat != null
      ? `${g.each ? '~' : ''}${g.carat}${g.ctw ? 'ctw' : 'ct'}${g.each ? ' ea' : ''}`
      : '';
  return [ct, g.shape, g.type, g.color, g.clarity].filter(Boolean).join(' ');
}

export default function NewListing() {
  const { group } = useLocalSearchParams<{ group: string }>();
  const groupId = group as string;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();

  const [caption, setCaption] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [certUri, setCertUri] = useState<string | null>(null);
  const [certMime, setCertMime] = useState('image/jpeg');
  const [form, setForm] = useState<Form>(EMPTY);
  const [gemstones, setGemstones] = useState<Gemstone[]>([]);
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [scanning, setScanning] = useState(false);
  const [ocrNote, setOcrNote] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const set = (key: keyof Form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  // The core "improve on WhatsApp" move: structure the free-text caption.
  const applyParsed = (p: ParsedListing) => {
    setForm((f) => ({
      ...f,
      title: p.title || f.title,
      category: p.category ?? f.category,
      metal: p.metal ?? f.metal,
      gross_weight: p.gross_weight != null ? String(p.gross_weight) : f.gross_weight,
      weight_unit: p.weight_unit ?? f.weight_unit,
      ring_size: p.ring_size ?? f.ring_size,
      item_length: p.item_length ?? f.item_length,
      era: p.era ?? f.era,
      condition: p.condition ?? f.condition,
      total_carat: p.total_carat != null ? String(p.total_carat) : f.total_carat,
      price_terms: p.price_terms ?? f.price_terms,
      stone_type: p.stone_type ?? f.stone_type,
      shape: p.shape ?? f.shape,
      carat: p.carat != null ? String(p.carat) : f.carat,
      color: p.color ?? f.color,
      clarity: p.clarity ?? f.clarity,
      cut: p.cut ?? f.cut,
      lab: p.lab ?? f.lab,
    }));
    if (p.gemstones.length) setGemstones(p.gemstones);
    if (p.price != null && !price.trim()) setPrice(String(p.price));
  };

  const autofill = () => {
    if (!caption.trim()) return;
    applyParsed(parseCaption(caption));
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
      quality: 0.7,
    });
    if (res.canceled) return;
    setPhotos((prev) => [...prev, ...res.assets.map((a) => a.uri)].slice(0, 6));
  };

  // Optional: scan a printed GIA/IGI cert (loose stones). Needs a dev build;
  // falls back to manual entry in Expo Go.
  const scanCert = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow camera access to scan a certificate.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'] as ImagePicker.MediaType[],
      quality: 0.85,
    });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    setCertUri(asset.uri);
    setCertMime(asset.mimeType ?? 'image/jpeg');
    setScanning(true);
    setOcrNote(null);
    try {
      const { parsed, useful } = await recognizeAndParseCertificate(asset.uri);
      setForm((f) => ({
        ...f,
        stone_type: parsed.stone_type ?? f.stone_type,
        shape: parsed.shape ?? f.shape,
        carat: parsed.carat != null ? String(parsed.carat) : f.carat,
        color: parsed.color ?? f.color,
        clarity: parsed.clarity ?? f.clarity,
        cut: parsed.cut ?? f.cut,
        measurements: parsed.measurements ?? f.measurements,
        lab: parsed.lab ?? f.lab,
        cert_number: parsed.cert_number ?? f.cert_number,
        title: f.title || parsed.title || '',
      }));
      if (!useful) setOcrNote("Couldn't read the certificate clearly — check the stone fields.");
    } catch (err) {
      setOcrNote(
        err instanceof OcrUnavailableError
          ? 'Certificate scanning needs a development build (not Expo Go). Type the stone details for now.'
          : 'Scan failed — type the stone details.',
      );
    } finally {
      setScanning(false);
    }
  };

  const post = async () => {
    if (!userId) return;
    const priceNum = num(price);
    if (priceNum == null) {
      Alert.alert('Add a price', 'Enter your asking price before posting.');
      return;
    }
    if (!caption.trim() && !form.title.trim() && photos.length === 0) {
      Alert.alert('Add some detail', 'Paste a listing, add a title, or attach a photo.');
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
        title: form.title.trim() || form.category.trim() || 'Item',
        price: priceNum,
        currency,
        photos: photoUrls,
        certificate_url: certificateUrl,
        description: caption.trim() || null,
        category: form.category.trim() || null,
        metal: form.metal.trim() || null,
        gross_weight: num(form.gross_weight),
        weight_unit: form.gross_weight.trim() ? form.weight_unit : null,
        ring_size: form.ring_size.trim() || null,
        item_length: form.item_length.trim() || null,
        condition: form.condition.trim() || null,
        era: form.era.trim() || null,
        total_carat: num(form.total_carat),
        price_terms: form.price_terms.trim() || null,
        gemstones: gemstones.length ? gemstones : null,
        stone_type: form.stone_type.trim() || null,
        shape: form.shape.trim() || null,
        carat: num(form.carat),
        color: form.color.trim() || null,
        clarity: form.clarity.trim() || null,
        cut: form.cut.trim() || null,
        measurements: form.measurements.trim() || null,
        lab: form.lab.trim() || null,
        cert_number: form.cert_number.trim() || null,
      });

      router.back();
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
        {/* Photos */}
        <View style={{ gap: spacing(2) }}>
          <Label>Photos</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing(3) }}>
            {photos.map((uri) => (
              <Image key={uri} source={{ uri }} style={styles.photo} contentFit="cover" />
            ))}
            <Pressable onPress={addPhotos} style={styles.addPhoto}>
              <Text style={styles.addPhotoGlyph}>＋</Text>
            </Pressable>
          </ScrollView>
        </View>

        {/* Caption — the hero input */}
        <View style={{ gap: spacing(2) }}>
          <Label>Listing details</Label>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            onBlur={autofill}
            placeholder={CAPTION_PLACEHOLDER}
            placeholderTextColor={colors.textFaint}
            style={styles.caption}
            multiline
          />
          <Button title="✨ Autofill from text" variant="secondary" small onPress={autofill} />
        </View>

        {ocrNote ? (
          <View style={styles.note}>
            <Text style={styles.noteText}>{ocrNote}</Text>
          </View>
        ) : null}

        {/* Structured fields (autofilled, editable) */}
        <View style={{ gap: spacing(4) }}>
          <Field label="Title" value={form.title} onChangeText={set('title')} placeholder="18K Ruby & Diamond Bracelet" />
          <View style={styles.grid}>
            <Field label="Type" value={form.category} onChangeText={set('category')} placeholder="Ring" style={styles.gridItem} />
            <Field label="Metal" value={form.metal} onChangeText={set('metal')} placeholder="18K Yellow Gold" style={styles.gridItem} />
          </View>

          <View style={styles.grid}>
            <View style={[styles.gridItem, { gap: spacing(2) }]}>
              <Label>Weight</Label>
              <View style={{ flexDirection: 'row', gap: spacing(2) }}>
                <TextInput
                  value={form.gross_weight}
                  onChangeText={set('gross_weight')}
                  placeholder="0"
                  keyboardType="numeric"
                  placeholderTextColor={colors.textFaint}
                  style={[styles.input, { flex: 1 }]}
                />
                <View style={styles.unitSeg}>
                  {(['g', 'dwt'] as WeightUnit[]).map((u) => (
                    <Pressable
                      key={u}
                      onPress={() => set('weight_unit')(u)}
                      style={[styles.unitItem, form.weight_unit === u && styles.unitItemActive]}
                    >
                      <Text style={[styles.unitText, form.weight_unit === u && styles.unitTextActive]}>{u}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
            <Field label="Ring size" value={form.ring_size} onChangeText={set('ring_size')} placeholder="6.5" style={styles.gridItem} />
          </View>

          <View style={styles.grid}>
            <Field label="Length" value={form.item_length} onChangeText={set('item_length')} placeholder={'18"'} style={styles.gridItem} />
            <Field label="Era / style" value={form.era} onChangeText={set('era')} placeholder="Antique" style={styles.gridItem} />
          </View>

          <Field label="Condition" value={form.condition} onChangeText={set('condition')} placeholder="e.g. chipped in a few places" />

          {/* Stone details */}
          <Label>Stone details</Label>
          <View style={styles.grid}>
            <Field label="Carat" value={form.carat} onChangeText={set('carat')} placeholder="1.52" keyboardType="numeric" style={styles.gridItem} />
            <Field label="Shape" value={form.shape} onChangeText={set('shape')} placeholder="Round" style={styles.gridItem} />
            <Field label="Color" value={form.color} onChangeText={set('color')} placeholder="G" autoCapitalize="characters" style={styles.gridItem} />
            <Field label="Clarity" value={form.clarity} onChangeText={set('clarity')} placeholder="VS1" autoCapitalize="characters" style={styles.gridItem} />
            <Field label="Cut" value={form.cut} onChangeText={set('cut')} placeholder="Excellent" style={styles.gridItem} />
            <Field label="Lab" value={form.lab} onChangeText={set('lab')} placeholder="GIA" autoCapitalize="characters" style={styles.gridItem} />
          </View>
          <View style={styles.grid}>
            <Field label="Total ctw" value={form.total_carat} onChangeText={set('total_carat')} placeholder="1.24" keyboardType="numeric" style={styles.gridItem} />
            <Field label="Cert #" value={form.cert_number} onChangeText={set('cert_number')} placeholder="2231457890" autoCapitalize="characters" style={styles.gridItem} />
          </View>

          {gemstones.length ? (
            <View style={{ gap: spacing(2) }}>
              <Label>Stones found</Label>
              <View style={styles.gemWrap}>
                {gemstones.map((g, i) => (
                  <View key={i} style={styles.gemChip}>
                    <Text style={styles.gemChipText}>{gemLabel(g)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {/* Optional certificate scan */}
          <Pressable onPress={scanCert} style={styles.certBtn} disabled={scanning}>
            <Text style={styles.certText}>
              {scanning ? 'Reading certificate…' : certUri ? '↻ Re-scan certificate' : '⌖ Scan a GIA/IGI certificate (optional)'}
            </Text>
          </Pressable>
        </View>

        {/* Price */}
        <View style={{ gap: spacing(2) }}>
          <Label>Asking price</Label>
          <Field value={price} onChangeText={setPrice} placeholder="0" keyboardType="numeric" />
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
          {form.price_terms ? <Text style={styles.terms}>Terms: {form.price_terms}</Text> : null}
        </View>
      </ScrollView>

      <View style={[styles.postBar, { paddingBottom: insets.bottom + spacing(3) }]}>
        <Button title="Post to group" onPress={post} loading={posting} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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

  caption: {
    minHeight: 110,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing(4),
    color: colors.text,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3.5),
    color: colors.text,
    fontSize: 16,
  },

  note: {
    backgroundColor: 'rgba(212,175,55,0.1)',
    borderColor: colors.goldDeep,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing(3.5),
  },
  noteText: { ...font.small, color: colors.goldSoft },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(3) },
  gridItem: { width: '47%', flexGrow: 1 },

  unitSeg: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 3 },
  unitItem: { paddingHorizontal: spacing(3), justifyContent: 'center', borderRadius: radius.sm },
  unitItemActive: { backgroundColor: colors.surfaceHi },
  unitText: { ...font.small, color: colors.textMuted },
  unitTextActive: { color: colors.goldSoft, fontWeight: '600' },

  gemWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  gemChip: {
    backgroundColor: colors.surfaceHi,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
  },
  gemChipText: { ...font.small, color: colors.text },

  certBtn: {
    backgroundColor: colors.surface,
    borderColor: colors.borderHi,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    padding: spacing(4),
    alignItems: 'center',
  },
  certText: { ...font.bodyStrong, color: colors.goldSoft },

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
  terms: { ...font.small, color: colors.textMuted },

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
