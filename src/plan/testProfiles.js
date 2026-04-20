// Profils fictifs pour tester le moteur d'allures.

export const testProfiles = [
  {
    name: "Coureur confirmé, VMA récente",
    expected: "high · direct · pas d'ajustement débutant",
    profile: {
      vma: 16.5,
      paceFreshness: "recent",
      experience: "2y+",
      weeklyVolumeKm: 55,
      activityLevel: "very_active",
      age: 32,
      sex: "male",
      weight: 72,
      height: 180,
    },
  },
  {
    name: "Intermédiaire, chrono 10k fraîche",
    expected: "medium · derived_from_10k (ratio 0.92)",
    profile: {
      paceSecondsPerKm: 270, // 4:30/km
      paceReferenceDistance: 10,
      paceFreshness: "recent",
      experience: "6m-2y",
      weeklyVolumeKm: 28,
      activityLevel: "active",
      age: 38,
      sex: "male",
      weight: 75,
      height: 178,
    },
  },
  {
    name: "Chrono semi — même allure mais distance longue",
    expected: "VMA plus haute que si traité comme 10k (ratio 0.87)",
    profile: {
      paceSecondsPerKm: 270, // 4:30/km, mais cette fois sur semi
      paceReferenceDistance: 21.1,
      paceFreshness: "recent",
      experience: "2y+",
      weeklyVolumeKm: 45,
      activityLevel: "active",
      age: 35,
      sex: "male",
      weight: 70,
      height: 180,
    },
  },
  {
    name: "VMA ancienne, débutante avec IMC élevé",
    expected: "medium · ajustement débutant · pénalité IMC",
    profile: {
      vma: 13,
      paceFreshness: "older",
      experience: "lt6m",
      weeklyVolumeKm: 10,
      activityLevel: "light",
      age: 45,
      sex: "female",
      weight: 78,
      height: 165, // IMC ≈ 28.7 → pénalité -1
    },
  },
  {
    name: "Profil vide — sédentaire total 40 ans",
    expected: "estimated · VMA médiane ~9-10 km/h",
    profile: {
      experience: "none",
      weeklyVolumeKm: 0,
      activityLevel: "sedentary",
      age: 40,
      sex: "male",
      weight: 80,
      height: 178, // IMC ≈ 25.2 → pénalité -0.4
    },
  },
  {
    name: "Candidat walk-run — sénior avec surpoids",
    expected: "VMA ≤ 9 → walkRunMode = true",
    profile: {
      experience: "none",
      weeklyVolumeKm: 0,
      activityLevel: "sedentary",
      age: 60,
      sex: "female",
      weight: 85,
      height: 162, // IMC ≈ 32.4 → pénalité -1
    },
  },
  {
    name: "Traileur aguerri — VMA récente 80km",
    expected: "high · direct · volume élevé",
    profile: {
      vma: 15.2,
      paceFreshness: "recent",
      experience: "2y+",
      weeklyVolumeKm: 65,
      activityLevel: "very_active",
      age: 41,
      sex: "male",
      weight: 68,
      height: 175,
      objectiveType: "trail_80",
      objectiveCategory: "trail",
      targetElevationM: 3500,
    },
  },
];
