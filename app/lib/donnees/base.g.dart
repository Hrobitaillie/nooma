// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'base.dart';

// ignore_for_file: type=lint
class $LearningEventsTable extends LearningEvents
    with TableInfo<$LearningEventsTable, LearningEvent> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $LearningEventsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<int> id = GeneratedColumn<int>(
    'id',
    aliasedName,
    false,
    hasAutoIncrement: true,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'PRIMARY KEY AUTOINCREMENT',
    ),
  );
  static const VerificationMeta _exerciceMeta = const VerificationMeta(
    'exercice',
  );
  @override
  late final GeneratedColumn<String> exercice = GeneratedColumn<String>(
    'exercice',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _competenceMeta = const VerificationMeta(
    'competence',
  );
  @override
  late final GeneratedColumn<String> competence = GeneratedColumn<String>(
    'competence',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _succesMeta = const VerificationMeta('succes');
  @override
  late final GeneratedColumn<bool> succes = GeneratedColumn<bool>(
    'succes',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("succes" IN (0, 1))',
    ),
  );
  static const VerificationMeta _avecAideMeta = const VerificationMeta(
    'avecAide',
  );
  @override
  late final GeneratedColumn<bool> avecAide = GeneratedColumn<bool>(
    'avec_aide',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("avec_aide" IN (0, 1))',
    ),
  );
  static const VerificationMeta _dureeMsMeta = const VerificationMeta(
    'dureeMs',
  );
  @override
  late final GeneratedColumn<int> dureeMs = GeneratedColumn<int>(
    'duree_ms',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _timestampMeta = const VerificationMeta(
    'timestamp',
  );
  @override
  late final GeneratedColumn<int> timestamp = GeneratedColumn<int>(
    'timestamp',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _seedMeta = const VerificationMeta('seed');
  @override
  late final GeneratedColumn<int> seed = GeneratedColumn<int>(
    'seed',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _versionContenuMeta = const VerificationMeta(
    'versionContenu',
  );
  @override
  late final GeneratedColumn<String> versionContenu = GeneratedColumn<String>(
    'version_contenu',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    exercice,
    competence,
    succes,
    avecAide,
    dureeMs,
    timestamp,
    seed,
    versionContenu,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'learning_events';
  @override
  VerificationContext validateIntegrity(
    Insertable<LearningEvent> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    }
    if (data.containsKey('exercice')) {
      context.handle(
        _exerciceMeta,
        exercice.isAcceptableOrUnknown(data['exercice']!, _exerciceMeta),
      );
    } else if (isInserting) {
      context.missing(_exerciceMeta);
    }
    if (data.containsKey('competence')) {
      context.handle(
        _competenceMeta,
        competence.isAcceptableOrUnknown(data['competence']!, _competenceMeta),
      );
    } else if (isInserting) {
      context.missing(_competenceMeta);
    }
    if (data.containsKey('succes')) {
      context.handle(
        _succesMeta,
        succes.isAcceptableOrUnknown(data['succes']!, _succesMeta),
      );
    } else if (isInserting) {
      context.missing(_succesMeta);
    }
    if (data.containsKey('avec_aide')) {
      context.handle(
        _avecAideMeta,
        avecAide.isAcceptableOrUnknown(data['avec_aide']!, _avecAideMeta),
      );
    } else if (isInserting) {
      context.missing(_avecAideMeta);
    }
    if (data.containsKey('duree_ms')) {
      context.handle(
        _dureeMsMeta,
        dureeMs.isAcceptableOrUnknown(data['duree_ms']!, _dureeMsMeta),
      );
    } else if (isInserting) {
      context.missing(_dureeMsMeta);
    }
    if (data.containsKey('timestamp')) {
      context.handle(
        _timestampMeta,
        timestamp.isAcceptableOrUnknown(data['timestamp']!, _timestampMeta),
      );
    } else if (isInserting) {
      context.missing(_timestampMeta);
    }
    if (data.containsKey('seed')) {
      context.handle(
        _seedMeta,
        seed.isAcceptableOrUnknown(data['seed']!, _seedMeta),
      );
    } else if (isInserting) {
      context.missing(_seedMeta);
    }
    if (data.containsKey('version_contenu')) {
      context.handle(
        _versionContenuMeta,
        versionContenu.isAcceptableOrUnknown(
          data['version_contenu']!,
          _versionContenuMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_versionContenuMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  LearningEvent map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return LearningEvent(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}id'],
      )!,
      exercice: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}exercice'],
      )!,
      competence: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}competence'],
      )!,
      succes: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}succes'],
      )!,
      avecAide: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}avec_aide'],
      )!,
      dureeMs: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}duree_ms'],
      )!,
      timestamp: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}timestamp'],
      )!,
      seed: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}seed'],
      )!,
      versionContenu: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}version_contenu'],
      )!,
    );
  }

  @override
  $LearningEventsTable createAlias(String alias) {
    return $LearningEventsTable(attachedDatabase, alias);
  }
}

class LearningEvent extends DataClass implements Insertable<LearningEvent> {
  final int id;

  /// Identifiant de l'exercice / mécanique jouée.
  final String exercice;

  /// Compétence pédagogique travaillée.
  final String competence;

  /// Réussite de l'exercice.
  final bool succes;

  /// Réussite obtenue avec une aide / un indice (pénalisée dans la maîtrise).
  final bool avecAide;

  /// Durée de l'exercice, en millisecondes.
  final int dureeMs;

  /// Horodatage de l'événement (ms epoch).
  final int timestamp;

  /// Seed déterministe du niveau joué (reproductibilité, doc 06 §2).
  final int seed;

  /// Version du contenu pédagogique ayant généré le niveau (traçabilité).
  final String versionContenu;
  const LearningEvent({
    required this.id,
    required this.exercice,
    required this.competence,
    required this.succes,
    required this.avecAide,
    required this.dureeMs,
    required this.timestamp,
    required this.seed,
    required this.versionContenu,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<int>(id);
    map['exercice'] = Variable<String>(exercice);
    map['competence'] = Variable<String>(competence);
    map['succes'] = Variable<bool>(succes);
    map['avec_aide'] = Variable<bool>(avecAide);
    map['duree_ms'] = Variable<int>(dureeMs);
    map['timestamp'] = Variable<int>(timestamp);
    map['seed'] = Variable<int>(seed);
    map['version_contenu'] = Variable<String>(versionContenu);
    return map;
  }

  LearningEventsCompanion toCompanion(bool nullToAbsent) {
    return LearningEventsCompanion(
      id: Value(id),
      exercice: Value(exercice),
      competence: Value(competence),
      succes: Value(succes),
      avecAide: Value(avecAide),
      dureeMs: Value(dureeMs),
      timestamp: Value(timestamp),
      seed: Value(seed),
      versionContenu: Value(versionContenu),
    );
  }

  factory LearningEvent.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return LearningEvent(
      id: serializer.fromJson<int>(json['id']),
      exercice: serializer.fromJson<String>(json['exercice']),
      competence: serializer.fromJson<String>(json['competence']),
      succes: serializer.fromJson<bool>(json['succes']),
      avecAide: serializer.fromJson<bool>(json['avecAide']),
      dureeMs: serializer.fromJson<int>(json['dureeMs']),
      timestamp: serializer.fromJson<int>(json['timestamp']),
      seed: serializer.fromJson<int>(json['seed']),
      versionContenu: serializer.fromJson<String>(json['versionContenu']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<int>(id),
      'exercice': serializer.toJson<String>(exercice),
      'competence': serializer.toJson<String>(competence),
      'succes': serializer.toJson<bool>(succes),
      'avecAide': serializer.toJson<bool>(avecAide),
      'dureeMs': serializer.toJson<int>(dureeMs),
      'timestamp': serializer.toJson<int>(timestamp),
      'seed': serializer.toJson<int>(seed),
      'versionContenu': serializer.toJson<String>(versionContenu),
    };
  }

  LearningEvent copyWith({
    int? id,
    String? exercice,
    String? competence,
    bool? succes,
    bool? avecAide,
    int? dureeMs,
    int? timestamp,
    int? seed,
    String? versionContenu,
  }) => LearningEvent(
    id: id ?? this.id,
    exercice: exercice ?? this.exercice,
    competence: competence ?? this.competence,
    succes: succes ?? this.succes,
    avecAide: avecAide ?? this.avecAide,
    dureeMs: dureeMs ?? this.dureeMs,
    timestamp: timestamp ?? this.timestamp,
    seed: seed ?? this.seed,
    versionContenu: versionContenu ?? this.versionContenu,
  );
  LearningEvent copyWithCompanion(LearningEventsCompanion data) {
    return LearningEvent(
      id: data.id.present ? data.id.value : this.id,
      exercice: data.exercice.present ? data.exercice.value : this.exercice,
      competence: data.competence.present
          ? data.competence.value
          : this.competence,
      succes: data.succes.present ? data.succes.value : this.succes,
      avecAide: data.avecAide.present ? data.avecAide.value : this.avecAide,
      dureeMs: data.dureeMs.present ? data.dureeMs.value : this.dureeMs,
      timestamp: data.timestamp.present ? data.timestamp.value : this.timestamp,
      seed: data.seed.present ? data.seed.value : this.seed,
      versionContenu: data.versionContenu.present
          ? data.versionContenu.value
          : this.versionContenu,
    );
  }

  @override
  String toString() {
    return (StringBuffer('LearningEvent(')
          ..write('id: $id, ')
          ..write('exercice: $exercice, ')
          ..write('competence: $competence, ')
          ..write('succes: $succes, ')
          ..write('avecAide: $avecAide, ')
          ..write('dureeMs: $dureeMs, ')
          ..write('timestamp: $timestamp, ')
          ..write('seed: $seed, ')
          ..write('versionContenu: $versionContenu')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    exercice,
    competence,
    succes,
    avecAide,
    dureeMs,
    timestamp,
    seed,
    versionContenu,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is LearningEvent &&
          other.id == this.id &&
          other.exercice == this.exercice &&
          other.competence == this.competence &&
          other.succes == this.succes &&
          other.avecAide == this.avecAide &&
          other.dureeMs == this.dureeMs &&
          other.timestamp == this.timestamp &&
          other.seed == this.seed &&
          other.versionContenu == this.versionContenu);
}

class LearningEventsCompanion extends UpdateCompanion<LearningEvent> {
  final Value<int> id;
  final Value<String> exercice;
  final Value<String> competence;
  final Value<bool> succes;
  final Value<bool> avecAide;
  final Value<int> dureeMs;
  final Value<int> timestamp;
  final Value<int> seed;
  final Value<String> versionContenu;
  const LearningEventsCompanion({
    this.id = const Value.absent(),
    this.exercice = const Value.absent(),
    this.competence = const Value.absent(),
    this.succes = const Value.absent(),
    this.avecAide = const Value.absent(),
    this.dureeMs = const Value.absent(),
    this.timestamp = const Value.absent(),
    this.seed = const Value.absent(),
    this.versionContenu = const Value.absent(),
  });
  LearningEventsCompanion.insert({
    this.id = const Value.absent(),
    required String exercice,
    required String competence,
    required bool succes,
    required bool avecAide,
    required int dureeMs,
    required int timestamp,
    required int seed,
    required String versionContenu,
  }) : exercice = Value(exercice),
       competence = Value(competence),
       succes = Value(succes),
       avecAide = Value(avecAide),
       dureeMs = Value(dureeMs),
       timestamp = Value(timestamp),
       seed = Value(seed),
       versionContenu = Value(versionContenu);
  static Insertable<LearningEvent> custom({
    Expression<int>? id,
    Expression<String>? exercice,
    Expression<String>? competence,
    Expression<bool>? succes,
    Expression<bool>? avecAide,
    Expression<int>? dureeMs,
    Expression<int>? timestamp,
    Expression<int>? seed,
    Expression<String>? versionContenu,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (exercice != null) 'exercice': exercice,
      if (competence != null) 'competence': competence,
      if (succes != null) 'succes': succes,
      if (avecAide != null) 'avec_aide': avecAide,
      if (dureeMs != null) 'duree_ms': dureeMs,
      if (timestamp != null) 'timestamp': timestamp,
      if (seed != null) 'seed': seed,
      if (versionContenu != null) 'version_contenu': versionContenu,
    });
  }

  LearningEventsCompanion copyWith({
    Value<int>? id,
    Value<String>? exercice,
    Value<String>? competence,
    Value<bool>? succes,
    Value<bool>? avecAide,
    Value<int>? dureeMs,
    Value<int>? timestamp,
    Value<int>? seed,
    Value<String>? versionContenu,
  }) {
    return LearningEventsCompanion(
      id: id ?? this.id,
      exercice: exercice ?? this.exercice,
      competence: competence ?? this.competence,
      succes: succes ?? this.succes,
      avecAide: avecAide ?? this.avecAide,
      dureeMs: dureeMs ?? this.dureeMs,
      timestamp: timestamp ?? this.timestamp,
      seed: seed ?? this.seed,
      versionContenu: versionContenu ?? this.versionContenu,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<int>(id.value);
    }
    if (exercice.present) {
      map['exercice'] = Variable<String>(exercice.value);
    }
    if (competence.present) {
      map['competence'] = Variable<String>(competence.value);
    }
    if (succes.present) {
      map['succes'] = Variable<bool>(succes.value);
    }
    if (avecAide.present) {
      map['avec_aide'] = Variable<bool>(avecAide.value);
    }
    if (dureeMs.present) {
      map['duree_ms'] = Variable<int>(dureeMs.value);
    }
    if (timestamp.present) {
      map['timestamp'] = Variable<int>(timestamp.value);
    }
    if (seed.present) {
      map['seed'] = Variable<int>(seed.value);
    }
    if (versionContenu.present) {
      map['version_contenu'] = Variable<String>(versionContenu.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('LearningEventsCompanion(')
          ..write('id: $id, ')
          ..write('exercice: $exercice, ')
          ..write('competence: $competence, ')
          ..write('succes: $succes, ')
          ..write('avecAide: $avecAide, ')
          ..write('dureeMs: $dureeMs, ')
          ..write('timestamp: $timestamp, ')
          ..write('seed: $seed, ')
          ..write('versionContenu: $versionContenu')
          ..write(')'))
        .toString();
  }
}

class $SkillProgressTable extends SkillProgress
    with TableInfo<$SkillProgressTable, SkillProgressData> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $SkillProgressTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _competenceMeta = const VerificationMeta(
    'competence',
  );
  @override
  late final GeneratedColumn<String> competence = GeneratedColumn<String>(
    'competence',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _maitriseMeta = const VerificationMeta(
    'maitrise',
  );
  @override
  late final GeneratedColumn<double> maitrise = GeneratedColumn<double>(
    'maitrise',
    aliasedName,
    false,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _rencontresMeta = const VerificationMeta(
    'rencontres',
  );
  @override
  late final GeneratedColumn<int> rencontres = GeneratedColumn<int>(
    'rencontres',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _valideeMeta = const VerificationMeta(
    'validee',
  );
  @override
  late final GeneratedColumn<bool> validee = GeneratedColumn<bool>(
    'validee',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("validee" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _boiteLeitnerMeta = const VerificationMeta(
    'boiteLeitner',
  );
  @override
  late final GeneratedColumn<int> boiteLeitner = GeneratedColumn<int>(
    'boite_leitner',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _prochainRappelMeta = const VerificationMeta(
    'prochainRappel',
  );
  @override
  late final GeneratedColumn<double> prochainRappel = GeneratedColumn<double>(
    'prochain_rappel',
    aliasedName,
    false,
    type: DriftSqlType.double,
    requiredDuringInsert: false,
    defaultValue: const Constant(-1),
  );
  static const VerificationMeta _dernierJourMeta = const VerificationMeta(
    'dernierJour',
  );
  @override
  late final GeneratedColumn<int> dernierJour = GeneratedColumn<int>(
    'dernier_jour',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(-1),
  );
  @override
  List<GeneratedColumn> get $columns => [
    competence,
    maitrise,
    rencontres,
    validee,
    boiteLeitner,
    prochainRappel,
    dernierJour,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'skill_progress';
  @override
  VerificationContext validateIntegrity(
    Insertable<SkillProgressData> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('competence')) {
      context.handle(
        _competenceMeta,
        competence.isAcceptableOrUnknown(data['competence']!, _competenceMeta),
      );
    } else if (isInserting) {
      context.missing(_competenceMeta);
    }
    if (data.containsKey('maitrise')) {
      context.handle(
        _maitriseMeta,
        maitrise.isAcceptableOrUnknown(data['maitrise']!, _maitriseMeta),
      );
    }
    if (data.containsKey('rencontres')) {
      context.handle(
        _rencontresMeta,
        rencontres.isAcceptableOrUnknown(data['rencontres']!, _rencontresMeta),
      );
    }
    if (data.containsKey('validee')) {
      context.handle(
        _valideeMeta,
        validee.isAcceptableOrUnknown(data['validee']!, _valideeMeta),
      );
    }
    if (data.containsKey('boite_leitner')) {
      context.handle(
        _boiteLeitnerMeta,
        boiteLeitner.isAcceptableOrUnknown(
          data['boite_leitner']!,
          _boiteLeitnerMeta,
        ),
      );
    }
    if (data.containsKey('prochain_rappel')) {
      context.handle(
        _prochainRappelMeta,
        prochainRappel.isAcceptableOrUnknown(
          data['prochain_rappel']!,
          _prochainRappelMeta,
        ),
      );
    }
    if (data.containsKey('dernier_jour')) {
      context.handle(
        _dernierJourMeta,
        dernierJour.isAcceptableOrUnknown(
          data['dernier_jour']!,
          _dernierJourMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {competence};
  @override
  SkillProgressData map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return SkillProgressData(
      competence: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}competence'],
      )!,
      maitrise: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}maitrise'],
      )!,
      rencontres: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}rencontres'],
      )!,
      validee: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}validee'],
      )!,
      boiteLeitner: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}boite_leitner'],
      )!,
      prochainRappel: attachedDatabase.typeMapping.read(
        DriftSqlType.double,
        data['${effectivePrefix}prochain_rappel'],
      )!,
      dernierJour: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}dernier_jour'],
      )!,
    );
  }

  @override
  $SkillProgressTable createAlias(String alias) {
    return $SkillProgressTable(attachedDatabase, alias);
  }
}

class SkillProgressData extends DataClass
    implements Insertable<SkillProgressData> {
  /// Compétence (clé primaire de la projection).
  final String competence;

  /// Maîtrise courante 0..1 (moyenne glissante, cf. directeur/maitrise.dart).
  final double maitrise;

  /// Nombre total de rencontres.
  final int rencontres;

  /// Compétence validée.
  final bool validee;

  /// Boîte de Leitner courante (0..3) pour la répétition espacée.
  final int boiteLeitner;

  /// Jour du prochain rappel (écho) dû.
  final double prochainRappel;

  /// Dernier jour de rencontre (pour la décroissance temporelle).
  final int dernierJour;
  const SkillProgressData({
    required this.competence,
    required this.maitrise,
    required this.rencontres,
    required this.validee,
    required this.boiteLeitner,
    required this.prochainRappel,
    required this.dernierJour,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['competence'] = Variable<String>(competence);
    map['maitrise'] = Variable<double>(maitrise);
    map['rencontres'] = Variable<int>(rencontres);
    map['validee'] = Variable<bool>(validee);
    map['boite_leitner'] = Variable<int>(boiteLeitner);
    map['prochain_rappel'] = Variable<double>(prochainRappel);
    map['dernier_jour'] = Variable<int>(dernierJour);
    return map;
  }

  SkillProgressCompanion toCompanion(bool nullToAbsent) {
    return SkillProgressCompanion(
      competence: Value(competence),
      maitrise: Value(maitrise),
      rencontres: Value(rencontres),
      validee: Value(validee),
      boiteLeitner: Value(boiteLeitner),
      prochainRappel: Value(prochainRappel),
      dernierJour: Value(dernierJour),
    );
  }

  factory SkillProgressData.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return SkillProgressData(
      competence: serializer.fromJson<String>(json['competence']),
      maitrise: serializer.fromJson<double>(json['maitrise']),
      rencontres: serializer.fromJson<int>(json['rencontres']),
      validee: serializer.fromJson<bool>(json['validee']),
      boiteLeitner: serializer.fromJson<int>(json['boiteLeitner']),
      prochainRappel: serializer.fromJson<double>(json['prochainRappel']),
      dernierJour: serializer.fromJson<int>(json['dernierJour']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'competence': serializer.toJson<String>(competence),
      'maitrise': serializer.toJson<double>(maitrise),
      'rencontres': serializer.toJson<int>(rencontres),
      'validee': serializer.toJson<bool>(validee),
      'boiteLeitner': serializer.toJson<int>(boiteLeitner),
      'prochainRappel': serializer.toJson<double>(prochainRappel),
      'dernierJour': serializer.toJson<int>(dernierJour),
    };
  }

  SkillProgressData copyWith({
    String? competence,
    double? maitrise,
    int? rencontres,
    bool? validee,
    int? boiteLeitner,
    double? prochainRappel,
    int? dernierJour,
  }) => SkillProgressData(
    competence: competence ?? this.competence,
    maitrise: maitrise ?? this.maitrise,
    rencontres: rencontres ?? this.rencontres,
    validee: validee ?? this.validee,
    boiteLeitner: boiteLeitner ?? this.boiteLeitner,
    prochainRappel: prochainRappel ?? this.prochainRappel,
    dernierJour: dernierJour ?? this.dernierJour,
  );
  SkillProgressData copyWithCompanion(SkillProgressCompanion data) {
    return SkillProgressData(
      competence: data.competence.present
          ? data.competence.value
          : this.competence,
      maitrise: data.maitrise.present ? data.maitrise.value : this.maitrise,
      rencontres: data.rencontres.present
          ? data.rencontres.value
          : this.rencontres,
      validee: data.validee.present ? data.validee.value : this.validee,
      boiteLeitner: data.boiteLeitner.present
          ? data.boiteLeitner.value
          : this.boiteLeitner,
      prochainRappel: data.prochainRappel.present
          ? data.prochainRappel.value
          : this.prochainRappel,
      dernierJour: data.dernierJour.present
          ? data.dernierJour.value
          : this.dernierJour,
    );
  }

  @override
  String toString() {
    return (StringBuffer('SkillProgressData(')
          ..write('competence: $competence, ')
          ..write('maitrise: $maitrise, ')
          ..write('rencontres: $rencontres, ')
          ..write('validee: $validee, ')
          ..write('boiteLeitner: $boiteLeitner, ')
          ..write('prochainRappel: $prochainRappel, ')
          ..write('dernierJour: $dernierJour')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    competence,
    maitrise,
    rencontres,
    validee,
    boiteLeitner,
    prochainRappel,
    dernierJour,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is SkillProgressData &&
          other.competence == this.competence &&
          other.maitrise == this.maitrise &&
          other.rencontres == this.rencontres &&
          other.validee == this.validee &&
          other.boiteLeitner == this.boiteLeitner &&
          other.prochainRappel == this.prochainRappel &&
          other.dernierJour == this.dernierJour);
}

class SkillProgressCompanion extends UpdateCompanion<SkillProgressData> {
  final Value<String> competence;
  final Value<double> maitrise;
  final Value<int> rencontres;
  final Value<bool> validee;
  final Value<int> boiteLeitner;
  final Value<double> prochainRappel;
  final Value<int> dernierJour;
  final Value<int> rowid;
  const SkillProgressCompanion({
    this.competence = const Value.absent(),
    this.maitrise = const Value.absent(),
    this.rencontres = const Value.absent(),
    this.validee = const Value.absent(),
    this.boiteLeitner = const Value.absent(),
    this.prochainRappel = const Value.absent(),
    this.dernierJour = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  SkillProgressCompanion.insert({
    required String competence,
    this.maitrise = const Value.absent(),
    this.rencontres = const Value.absent(),
    this.validee = const Value.absent(),
    this.boiteLeitner = const Value.absent(),
    this.prochainRappel = const Value.absent(),
    this.dernierJour = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : competence = Value(competence);
  static Insertable<SkillProgressData> custom({
    Expression<String>? competence,
    Expression<double>? maitrise,
    Expression<int>? rencontres,
    Expression<bool>? validee,
    Expression<int>? boiteLeitner,
    Expression<double>? prochainRappel,
    Expression<int>? dernierJour,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (competence != null) 'competence': competence,
      if (maitrise != null) 'maitrise': maitrise,
      if (rencontres != null) 'rencontres': rencontres,
      if (validee != null) 'validee': validee,
      if (boiteLeitner != null) 'boite_leitner': boiteLeitner,
      if (prochainRappel != null) 'prochain_rappel': prochainRappel,
      if (dernierJour != null) 'dernier_jour': dernierJour,
      if (rowid != null) 'rowid': rowid,
    });
  }

  SkillProgressCompanion copyWith({
    Value<String>? competence,
    Value<double>? maitrise,
    Value<int>? rencontres,
    Value<bool>? validee,
    Value<int>? boiteLeitner,
    Value<double>? prochainRappel,
    Value<int>? dernierJour,
    Value<int>? rowid,
  }) {
    return SkillProgressCompanion(
      competence: competence ?? this.competence,
      maitrise: maitrise ?? this.maitrise,
      rencontres: rencontres ?? this.rencontres,
      validee: validee ?? this.validee,
      boiteLeitner: boiteLeitner ?? this.boiteLeitner,
      prochainRappel: prochainRappel ?? this.prochainRappel,
      dernierJour: dernierJour ?? this.dernierJour,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (competence.present) {
      map['competence'] = Variable<String>(competence.value);
    }
    if (maitrise.present) {
      map['maitrise'] = Variable<double>(maitrise.value);
    }
    if (rencontres.present) {
      map['rencontres'] = Variable<int>(rencontres.value);
    }
    if (validee.present) {
      map['validee'] = Variable<bool>(validee.value);
    }
    if (boiteLeitner.present) {
      map['boite_leitner'] = Variable<int>(boiteLeitner.value);
    }
    if (prochainRappel.present) {
      map['prochain_rappel'] = Variable<double>(prochainRappel.value);
    }
    if (dernierJour.present) {
      map['dernier_jour'] = Variable<int>(dernierJour.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('SkillProgressCompanion(')
          ..write('competence: $competence, ')
          ..write('maitrise: $maitrise, ')
          ..write('rencontres: $rencontres, ')
          ..write('validee: $validee, ')
          ..write('boiteLeitner: $boiteLeitner, ')
          ..write('prochainRappel: $prochainRappel, ')
          ..write('dernierJour: $dernierJour, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$BaseLocale extends GeneratedDatabase {
  _$BaseLocale(QueryExecutor e) : super(e);
  $BaseLocaleManager get managers => $BaseLocaleManager(this);
  late final $LearningEventsTable learningEvents = $LearningEventsTable(this);
  late final $SkillProgressTable skillProgress = $SkillProgressTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    learningEvents,
    skillProgress,
  ];
}

typedef $$LearningEventsTableCreateCompanionBuilder =
    LearningEventsCompanion Function({
      Value<int> id,
      required String exercice,
      required String competence,
      required bool succes,
      required bool avecAide,
      required int dureeMs,
      required int timestamp,
      required int seed,
      required String versionContenu,
    });
typedef $$LearningEventsTableUpdateCompanionBuilder =
    LearningEventsCompanion Function({
      Value<int> id,
      Value<String> exercice,
      Value<String> competence,
      Value<bool> succes,
      Value<bool> avecAide,
      Value<int> dureeMs,
      Value<int> timestamp,
      Value<int> seed,
      Value<String> versionContenu,
    });

class $$LearningEventsTableFilterComposer
    extends Composer<_$BaseLocale, $LearningEventsTable> {
  $$LearningEventsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get exercice => $composableBuilder(
    column: $table.exercice,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get competence => $composableBuilder(
    column: $table.competence,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get succes => $composableBuilder(
    column: $table.succes,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get avecAide => $composableBuilder(
    column: $table.avecAide,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get dureeMs => $composableBuilder(
    column: $table.dureeMs,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get timestamp => $composableBuilder(
    column: $table.timestamp,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get seed => $composableBuilder(
    column: $table.seed,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get versionContenu => $composableBuilder(
    column: $table.versionContenu,
    builder: (column) => ColumnFilters(column),
  );
}

class $$LearningEventsTableOrderingComposer
    extends Composer<_$BaseLocale, $LearningEventsTable> {
  $$LearningEventsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<int> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get exercice => $composableBuilder(
    column: $table.exercice,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get competence => $composableBuilder(
    column: $table.competence,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get succes => $composableBuilder(
    column: $table.succes,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get avecAide => $composableBuilder(
    column: $table.avecAide,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get dureeMs => $composableBuilder(
    column: $table.dureeMs,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get timestamp => $composableBuilder(
    column: $table.timestamp,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get seed => $composableBuilder(
    column: $table.seed,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get versionContenu => $composableBuilder(
    column: $table.versionContenu,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$LearningEventsTableAnnotationComposer
    extends Composer<_$BaseLocale, $LearningEventsTable> {
  $$LearningEventsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<int> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get exercice =>
      $composableBuilder(column: $table.exercice, builder: (column) => column);

  GeneratedColumn<String> get competence => $composableBuilder(
    column: $table.competence,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get succes =>
      $composableBuilder(column: $table.succes, builder: (column) => column);

  GeneratedColumn<bool> get avecAide =>
      $composableBuilder(column: $table.avecAide, builder: (column) => column);

  GeneratedColumn<int> get dureeMs =>
      $composableBuilder(column: $table.dureeMs, builder: (column) => column);

  GeneratedColumn<int> get timestamp =>
      $composableBuilder(column: $table.timestamp, builder: (column) => column);

  GeneratedColumn<int> get seed =>
      $composableBuilder(column: $table.seed, builder: (column) => column);

  GeneratedColumn<String> get versionContenu => $composableBuilder(
    column: $table.versionContenu,
    builder: (column) => column,
  );
}

class $$LearningEventsTableTableManager
    extends
        RootTableManager<
          _$BaseLocale,
          $LearningEventsTable,
          LearningEvent,
          $$LearningEventsTableFilterComposer,
          $$LearningEventsTableOrderingComposer,
          $$LearningEventsTableAnnotationComposer,
          $$LearningEventsTableCreateCompanionBuilder,
          $$LearningEventsTableUpdateCompanionBuilder,
          (
            LearningEvent,
            BaseReferences<_$BaseLocale, $LearningEventsTable, LearningEvent>,
          ),
          LearningEvent,
          PrefetchHooks Function()
        > {
  $$LearningEventsTableTableManager(_$BaseLocale db, $LearningEventsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$LearningEventsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$LearningEventsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$LearningEventsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                Value<String> exercice = const Value.absent(),
                Value<String> competence = const Value.absent(),
                Value<bool> succes = const Value.absent(),
                Value<bool> avecAide = const Value.absent(),
                Value<int> dureeMs = const Value.absent(),
                Value<int> timestamp = const Value.absent(),
                Value<int> seed = const Value.absent(),
                Value<String> versionContenu = const Value.absent(),
              }) => LearningEventsCompanion(
                id: id,
                exercice: exercice,
                competence: competence,
                succes: succes,
                avecAide: avecAide,
                dureeMs: dureeMs,
                timestamp: timestamp,
                seed: seed,
                versionContenu: versionContenu,
              ),
          createCompanionCallback:
              ({
                Value<int> id = const Value.absent(),
                required String exercice,
                required String competence,
                required bool succes,
                required bool avecAide,
                required int dureeMs,
                required int timestamp,
                required int seed,
                required String versionContenu,
              }) => LearningEventsCompanion.insert(
                id: id,
                exercice: exercice,
                competence: competence,
                succes: succes,
                avecAide: avecAide,
                dureeMs: dureeMs,
                timestamp: timestamp,
                seed: seed,
                versionContenu: versionContenu,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$LearningEventsTableProcessedTableManager =
    ProcessedTableManager<
      _$BaseLocale,
      $LearningEventsTable,
      LearningEvent,
      $$LearningEventsTableFilterComposer,
      $$LearningEventsTableOrderingComposer,
      $$LearningEventsTableAnnotationComposer,
      $$LearningEventsTableCreateCompanionBuilder,
      $$LearningEventsTableUpdateCompanionBuilder,
      (
        LearningEvent,
        BaseReferences<_$BaseLocale, $LearningEventsTable, LearningEvent>,
      ),
      LearningEvent,
      PrefetchHooks Function()
    >;
typedef $$SkillProgressTableCreateCompanionBuilder =
    SkillProgressCompanion Function({
      required String competence,
      Value<double> maitrise,
      Value<int> rencontres,
      Value<bool> validee,
      Value<int> boiteLeitner,
      Value<double> prochainRappel,
      Value<int> dernierJour,
      Value<int> rowid,
    });
typedef $$SkillProgressTableUpdateCompanionBuilder =
    SkillProgressCompanion Function({
      Value<String> competence,
      Value<double> maitrise,
      Value<int> rencontres,
      Value<bool> validee,
      Value<int> boiteLeitner,
      Value<double> prochainRappel,
      Value<int> dernierJour,
      Value<int> rowid,
    });

class $$SkillProgressTableFilterComposer
    extends Composer<_$BaseLocale, $SkillProgressTable> {
  $$SkillProgressTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get competence => $composableBuilder(
    column: $table.competence,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get maitrise => $composableBuilder(
    column: $table.maitrise,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get rencontres => $composableBuilder(
    column: $table.rencontres,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get validee => $composableBuilder(
    column: $table.validee,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get boiteLeitner => $composableBuilder(
    column: $table.boiteLeitner,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<double> get prochainRappel => $composableBuilder(
    column: $table.prochainRappel,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get dernierJour => $composableBuilder(
    column: $table.dernierJour,
    builder: (column) => ColumnFilters(column),
  );
}

class $$SkillProgressTableOrderingComposer
    extends Composer<_$BaseLocale, $SkillProgressTable> {
  $$SkillProgressTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get competence => $composableBuilder(
    column: $table.competence,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get maitrise => $composableBuilder(
    column: $table.maitrise,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get rencontres => $composableBuilder(
    column: $table.rencontres,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get validee => $composableBuilder(
    column: $table.validee,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get boiteLeitner => $composableBuilder(
    column: $table.boiteLeitner,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<double> get prochainRappel => $composableBuilder(
    column: $table.prochainRappel,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get dernierJour => $composableBuilder(
    column: $table.dernierJour,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$SkillProgressTableAnnotationComposer
    extends Composer<_$BaseLocale, $SkillProgressTable> {
  $$SkillProgressTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get competence => $composableBuilder(
    column: $table.competence,
    builder: (column) => column,
  );

  GeneratedColumn<double> get maitrise =>
      $composableBuilder(column: $table.maitrise, builder: (column) => column);

  GeneratedColumn<int> get rencontres => $composableBuilder(
    column: $table.rencontres,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get validee =>
      $composableBuilder(column: $table.validee, builder: (column) => column);

  GeneratedColumn<int> get boiteLeitner => $composableBuilder(
    column: $table.boiteLeitner,
    builder: (column) => column,
  );

  GeneratedColumn<double> get prochainRappel => $composableBuilder(
    column: $table.prochainRappel,
    builder: (column) => column,
  );

  GeneratedColumn<int> get dernierJour => $composableBuilder(
    column: $table.dernierJour,
    builder: (column) => column,
  );
}

class $$SkillProgressTableTableManager
    extends
        RootTableManager<
          _$BaseLocale,
          $SkillProgressTable,
          SkillProgressData,
          $$SkillProgressTableFilterComposer,
          $$SkillProgressTableOrderingComposer,
          $$SkillProgressTableAnnotationComposer,
          $$SkillProgressTableCreateCompanionBuilder,
          $$SkillProgressTableUpdateCompanionBuilder,
          (
            SkillProgressData,
            BaseReferences<
              _$BaseLocale,
              $SkillProgressTable,
              SkillProgressData
            >,
          ),
          SkillProgressData,
          PrefetchHooks Function()
        > {
  $$SkillProgressTableTableManager(_$BaseLocale db, $SkillProgressTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$SkillProgressTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$SkillProgressTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$SkillProgressTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> competence = const Value.absent(),
                Value<double> maitrise = const Value.absent(),
                Value<int> rencontres = const Value.absent(),
                Value<bool> validee = const Value.absent(),
                Value<int> boiteLeitner = const Value.absent(),
                Value<double> prochainRappel = const Value.absent(),
                Value<int> dernierJour = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SkillProgressCompanion(
                competence: competence,
                maitrise: maitrise,
                rencontres: rencontres,
                validee: validee,
                boiteLeitner: boiteLeitner,
                prochainRappel: prochainRappel,
                dernierJour: dernierJour,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String competence,
                Value<double> maitrise = const Value.absent(),
                Value<int> rencontres = const Value.absent(),
                Value<bool> validee = const Value.absent(),
                Value<int> boiteLeitner = const Value.absent(),
                Value<double> prochainRappel = const Value.absent(),
                Value<int> dernierJour = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => SkillProgressCompanion.insert(
                competence: competence,
                maitrise: maitrise,
                rencontres: rencontres,
                validee: validee,
                boiteLeitner: boiteLeitner,
                prochainRappel: prochainRappel,
                dernierJour: dernierJour,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$SkillProgressTableProcessedTableManager =
    ProcessedTableManager<
      _$BaseLocale,
      $SkillProgressTable,
      SkillProgressData,
      $$SkillProgressTableFilterComposer,
      $$SkillProgressTableOrderingComposer,
      $$SkillProgressTableAnnotationComposer,
      $$SkillProgressTableCreateCompanionBuilder,
      $$SkillProgressTableUpdateCompanionBuilder,
      (
        SkillProgressData,
        BaseReferences<_$BaseLocale, $SkillProgressTable, SkillProgressData>,
      ),
      SkillProgressData,
      PrefetchHooks Function()
    >;

class $BaseLocaleManager {
  final _$BaseLocale _db;
  $BaseLocaleManager(this._db);
  $$LearningEventsTableTableManager get learningEvents =>
      $$LearningEventsTableTableManager(_db, _db.learningEvents);
  $$SkillProgressTableTableManager get skillProgress =>
      $$SkillProgressTableTableManager(_db, _db.skillProgress);
}
