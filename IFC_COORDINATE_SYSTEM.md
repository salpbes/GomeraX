# IFC Coordinate System Reference

## ⚠️ Important: IFC Longitude Convention

The IFC specification uses a **non-standard longitude convention** that differs from GPS/GIS systems!

---

## IFC IfcSite Geographic Coordinates (WGS84)

### RefLatitude: IfcCompoundPlaneAngleMeasure

**Standard convention (same as GPS):**
- **+North** of equator: `0` to `+90°`
- **-South** of equator: `0` to `-90°`

✅ This matches standard geographic coordinate systems.

### RefLongitude: IfcCompoundPlaneAngleMeasure

**⚠️ IFC-specific convention (OPPOSITE to GPS!):**
- **+WEST** of zero meridian: `0` to `+180°`
- **-EAST** of zero meridian: `0` to `-180°`

❌ **This is OPPOSITE to standard GPS/GIS where:**
- East longitude is positive
- West longitude is negative

### RefElevation: IfcLengthMeasure

**Standard convention:**
- Height above sea level in **meters**
- Positive values = above sea level
- Negative values = below sea level

---

## IfcCompoundPlaneAngleMeasure Format

IFC stores latitude/longitude as an array of **integers**:

```
[degrees, minutes, seconds, millionths-of-seconds]
```

### Example: 51.5074° N (London latitude)

**Decimal:** `51.5074°`

**IFC Array:** `[51, 30, 26, 640000]`

**Conversion:**
```
51° + (30/60) + (26 + 640000/1000000)/3600
= 51° + 0.5° + 0.0074°
= 51.5074°
```

### Sign Convention

- The **sign is in the degrees component**
- Positive degrees → positive coordinate
- Negative degrees → negative coordinate

---

## Real-World Example Comparisons

### London, UK

| System | Latitude | Longitude |
|--------|----------|-----------|
| **GPS/GIS** | 51.5074° N | 0.1278° W |
| **IFC** | +51.5074° | +0.1278° |

Note: Both show as positive for West longitude in IFC!

### New York, USA

| System | Latitude | Longitude |
|--------|----------|-----------|
| **GPS/GIS** | 40.7128° N | 74.0060° W |
| **IFC** | +40.7128° | +74.0060° |

### Tokyo, Japan

| System | Latitude | Longitude |
|--------|----------|-----------|
| **GPS/GIS** | 35.6762° N | 139.6503° E |
| **IFC** | +35.6762° | **-139.6503°** |

⚠️ Notice: Tokyo's East longitude is **NEGATIVE** in IFC!

### Sydney, Australia

| System | Latitude | Longitude |
|--------|----------|-----------|
| **GPS/GIS** | 33.8688° S | 151.2093° E |
| **IFC** | **-33.8688°** | **-151.2093°** |

⚠️ Both negative: South latitude (standard) + East longitude (IFC convention)

---

## Conversion Formula: IFC → Standard GPS

```typescript
// IFC coordinates
const ifcLatitude = +51.5074;   // North is positive (standard)
const ifcLongitude = +0.1278;   // West is positive (IFC-specific)

// Convert to standard GPS
const gpsLatitude = ifcLatitude;        // No change needed
const gpsLongitude = -ifcLongitude;     // NEGATE for GPS!

// Result:
// GPS: 51.5074° N, -0.1278° (West is negative in GPS)
```

---

## Implementation in This Viewer

### Parsing (IfcSiteAlignmentModule.ts)

```typescript
private parseLatLongValue(data: any): number | null {
  // Extract [degrees, minutes, seconds, millionths]
  const decimal = Math.abs(degrees) + 
                  minutes / 60.0 + 
                  (seconds + millionths / 1000000.0) / 3600.0;
  
  // Apply sign from degrees (preserves IFC convention)
  return degrees < 0 ? -decimal : decimal;
}
```

### Geographic Offset Calculation

```typescript
private calculateGeoOffset(modelSite, referenceSite): Vector3 {
  const lon1 = referenceSite.refLongitude!; // IFC: +West/-East
  const lon2 = modelSite.refLongitude!;     // IFC: +West/-East
  
  const lonDiff = lon2 - lon1;  // In IFC convention
  
  // Convert to meters
  const offsetEastWest = -lonDiff * metersPerDegreeLon;
  //                     ^ NEGATE to convert IFC → standard East-West
  
  // In IFC: negative lonDiff means model is more EAST
  // In standard: East is positive
  // So we negate: -(-) = + for East
  
  return new THREE.Vector3(offsetEastWest, elevation, northSouth);
}
```

### Coordinate System Mapping

**Three.js axes:**
- **X axis** = East-West (East is +X, West is -X)
- **Y axis** = Elevation (Up is +Y, Down is -Y)
- **Z axis** = North-South (North is -Z, South is +Z by convention)

**From IFC to Three.js:**
```typescript
offsetX = -ifcLongitudeDiff * metersPerDegree  // E-W, negate for IFC
offsetY = elevationDiff                         // Up-Down (standard)
offsetZ = -latitudeDiff * metersPerDegree      // N-S (standard, but inverted for Three.js Z)
```

---

## Why This Convention?

Historical reasons in early surveying and navigation:
- Longitude was originally measured from Greenwich (0°)
- Westward from Greenwich was considered "positive progress"
- IFC inherited this from early cartography standards

**Modern systems** (GPS, GIS, Google Maps) use the opposite:
- East longitude = positive
- West longitude = negative

---

## Testing Your IFC Files

### Check Your IfcSite Coordinates

1. Load your IFC file
2. Click **"📋 Show Site Info"**
3. Look at the coordinates

**Example output:**
```
📍 Latitude: +40.748817° N
    (North of equator)
📍 Longitude: +73.985428° W (IFC)
    (West of zero meridian)
⬆️ Elevation: 10.00m above sea level
```

### Verify Alignment

If you have models that should be at the same location:

1. Load both models
2. Click **"✅ Check Site Alignment"**
3. Look for coordinate differences

If coordinates match, alignment should work perfectly!

---

## References

- **IFC 4 Specification**: buildingSMART International
- **IfcSite Entity**: Section 5.1.5.3
- **IfcCompoundPlaneAngleMeasure**: Geographic coordinate representation
- **WGS84**: World Geodetic System 1984

---

## Quick Reference Card

| Coordinate | IFC Sign | Meaning |
|------------|----------|---------|
| Latitude > 0 | ✅ Positive | North of equator |
| Latitude < 0 | ✅ Negative | South of equator |
| Longitude > 0 | ⚠️ Positive | **WEST** (IFC-specific!) |
| Longitude < 0 | ⚠️ Negative | **EAST** (IFC-specific!) |
| Elevation > 0 | ✅ Positive | Above sea level |
| Elevation < 0 | ✅ Negative | Below sea level |

**Remember:** Only longitude is different from GPS! 🌍

---

**Last Updated:** October 25, 2025
