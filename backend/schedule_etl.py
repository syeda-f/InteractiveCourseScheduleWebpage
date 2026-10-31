import pandas as pd
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / 'data'
OUTPUT_DIR = BASE_DIR / 'output'

female_file = DATA_DIR / 'femalefall.csv'
male_file = DATA_DIR / 'malefall.csv'
nom_file = DATA_DIR / 'Nomenclature.csv'
merge_file = DATA_DIR / 'Cross_Listed_Codes.csv'


def validate_input_files(*paths):
    missing = [str(path) for path in paths if not Path(path).is_file()]
    if missing:
        raise FileNotFoundError('Required input files missing:\n' + '\n'.join(missing))
    print('PASS: All input files found')

SCHEDULE_KEYS = [
    'term_code', 'camp_code', 'sequence_number', 'course_title',
    'atiming', 'sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'room', 'instructor'
]
NUMERIC_COLUMNS = ['max_enrl', 'enrl', 'avail']
CODE_COLUMNS = ['COSC', 'SOEN', 'AINT', 'ITAP', 'CSEC', 'COEN']


def extract(female_file_name, male_file_name):
    female_df = pd.read_csv(female_file_name, header=1, dtype=str)
    male_df = pd.read_csv(male_file_name, dtype=str)
    return female_df, male_df


def transform_general(female_df, male_df, nom_file_name):
    female_df = female_df.dropna(how='all')
    male_df = male_df.dropna(how='all')
    male_df = male_df[male_df['TERM CODE'] != 'TERM CODE']
    df = pd.concat([female_df, male_df], ignore_index=True)
    df = df.rename(columns={
        'TERM CODE': 'term_code', 'CRN': 'crn', 'CAMP CODE': 'camp_code',
        'COURSE CODE': 'course_code', 'SEQUENCE NUMBER': 'sequence_number',
        'COURSE Title': 'course_title', 'MAX_ENRL': 'max_enrl',
        'ENRL': 'enrl', 'AVAIL': 'avail', 'SESSION_CODE': 'session_code',
        'ATIMING': 'atiming', 'SAT': 'sat', 'SUN': 'sun', 'MON': 'mon',
        'TUE': 'tue', 'WED': 'wed', 'THU': 'thu', 'ROOM': 'room',
        'Instructor': 'instructor'
    })
    df = df.apply(lambda col: col.str.strip() if col.dtype == 'object' else col)
    df['instructor'] = df['instructor'].replace('NAME NOT FOUND FOR PIDM:', 'Unassigned').str.title()
    df = df[~df['course_title'].isin([
        'Intermediate Enhanced Learning', 'Advance Enhanced Learning', 'Advance Exit Exam'
    ])].copy()
    for col in NUMERIC_COLUMNS:
        df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype('int32')
    df['weekly_contact_hr'] = pd.to_numeric(
        df['weekly_contact_hr'], errors='coerce'
    ).fillna(0.0)

    nom_df = pd.read_csv(nom_file_name, dtype=str)
    nom_df = nom_df.apply(lambda col: col.str.strip() if col.dtype == 'object' else col)
    # Prevent an accidental one-to-many join from duplicating enrollment.
    duplicate_nom = nom_df.duplicated(['course_code', 'original_course_title'], keep=False)
    if duplicate_nom.any():
        raise ValueError('Nomenclature.csv has duplicate course_code + original_course_title keys')
    df = df.merge(
        nom_df[['course_code', 'original_course_title', 'unified_course_title']],
        how='left', left_on=['course_code', 'course_title'],
        right_on=['course_code', 'original_course_title'], validate='many_to_one'
    )
    df['course_title'] = df['unified_course_title'].combine_first(df['course_title'])
    return df.drop(columns=['unified_course_title', 'original_course_title'])


def load_mapping(merge_file_name):
    mapping = pd.read_csv(merge_file_name, dtype=str)
    mapping = mapping.apply(lambda col: col.str.strip() if col.dtype == 'object' else col)
    required = {'final_course_code', 'course_title', *CODE_COLUMNS}
    missing = required - set(mapping.columns)
    if missing:
        raise ValueError(f'Missing mapping columns: {sorted(missing)}')
    if mapping['final_course_code'].isna().any():
        raise ValueError('Cross-listed mapping contains a blank final_course_code')
    pairs = []
    for _, row in mapping.iterrows():
        for col in CODE_COLUMNS:
            code = row[col]
            if pd.notna(code) and code:
                pairs.append((code, row['final_course_code']))
        # The canonical code should also map to itself.
        pairs.append((row['final_course_code'], row['final_course_code']))
    code_map = pd.DataFrame(pairs, columns=['original_code', 'final_course_code'])
    conflicts = code_map.groupby('original_code')['final_course_code'].nunique()
    conflicts = conflicts[conflicts > 1]
    if not conflicts.empty:
        raise ValueError(f'Conflicting final codes for: {conflicts.index.tolist()}')
    return mapping, dict(code_map.drop_duplicates('original_code').values)


def transform_merge(df, merge_file_name):
    _, code_map = load_mapping(merge_file_name)
    df = df.copy()
    df['original_course_code'] = df['course_code']
    df['course_code'] = df['course_code'].map(code_map).fillna(df['course_code'])

    # Include unified course_code: two unrelated courses must not merge merely
    # because their title, schedule, room, and instructor happen to match.
    group_keys = ['course_code'] + SCHEDULE_KEYS
    merged = df.groupby(group_keys, as_index=False, dropna=False).agg({
        'max_enrl': 'sum', 'enrl': 'sum', 'avail': 'sum',
        'crn': 'first', 'session_code': 'first',
        'weekly_contact_hr': 'first'
    })
    merged = merged[[
        'term_code', 'crn', 'camp_code', 'course_code', 'sequence_number',
        'course_title', 'max_enrl', 'enrl', 'avail', 'session_code',
        'atiming', 'sat', 'sun', 'mon', 'tue', 'wed', 'thu',
        'room', 'instructor', 'weekly_contact_hr'
    ]]
    return merged


def validate_merge(original_df, merged_df, merge_file_name):
    mapping, code_map = load_mapping(merge_file_name)
    print('\n=== CROSS-LISTED MERGE VALIDATION ===')
    print(f'Original sections: {len(original_df)}')
    print(f'Merged sections:   {len(merged_df)}')
    print(f'Sections combined: {len(original_df) - len(merged_df)}')

    errors = []
    for col in NUMERIC_COLUMNS:
        before, after = int(original_df[col].sum()), int(merged_df[col].sum())
        status = 'PASS' if before == after else 'FAIL'
        print(f'{status}: {col} totals: original={before}, merged={after}')
        if before != after:
            errors.append(f'{col} total changed: {before} -> {after}')

    # Compare every expected merged group with its actual group.
    expected = original_df.copy()
    expected['course_code'] = expected['course_code'].map(code_map).fillna(expected['course_code'])
    keys = ['course_code'] + SCHEDULE_KEYS
    expected_groups = expected.groupby(keys, dropna=False)[NUMERIC_COLUMNS].sum().reset_index()
    actual_groups = merged_df.groupby(keys, dropna=False)[NUMERIC_COLUMNS].sum().reset_index()
    check = expected_groups.merge(actual_groups, on=keys, how='outer',
                                  suffixes=('_expected', '_actual'), indicator=True)
    invalid = check['_merge'].ne('both')
    for col in NUMERIC_COLUMNS:
        invalid |= check[f'{col}_expected'].ne(check[f'{col}_actual'])
    if invalid.any():
        errors.append(f'{int(invalid.sum())} merged groups have missing/incorrect values')
        print('FAIL: Incorrect merged groups (first 10):')
        print(check.loc[invalid, ['course_code', 'course_title', '_merge']].head(10).to_string(index=False))
    else:
        print('PASS: All merged course codes and group totals match the mapping')

    mapped = original_df['course_code'].isin(code_map)
    changed = mapped & original_df['course_code'].ne(original_df['course_code'].map(code_map))
    print(f'Mapped original sections: {int(mapped.sum())}')
    print(f'Sections requiring code changes: {int(changed.sum())}')
    unmapped = sorted(set(original_df.loc[~mapped, 'course_code'].dropna()))
    print(f'Unmapped course codes (left unchanged): {len(unmapped)}')
    if unmapped:
        print('Unmapped examples:', ', '.join(unmapped[:15]))

    # Display mappings that occur in this term, including Cloud Computing.
    examples = original_df.loc[changed, ['course_code']].drop_duplicates().copy()
    examples['final_course_code'] = examples['course_code'].map(code_map)
    if not examples.empty:
        print('\nApplied course-code changes:')
        print(examples.sort_values('course_code').to_string(index=False))

    if errors:
        raise ValueError('Merge validation failed: ' + '; '.join(errors))
    print('RESULT: PASS — merged data follows Cross_Listed_Codes.csv')
    return True


def load(df, output_file=None):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output_file = Path(output_file) if output_file is not None else OUTPUT_DIR / 'merged_fall.csv'
    df.to_csv(output_file, index=False)
    print(f'Saved merged schedule to {output_file}')


def run(female_file, male_file, nom_file, merge_file):
    validate_input_files(female_file, male_file, nom_file, merge_file)
    female_df, male_df = extract(female_file, male_file)
    original_df = transform_general(female_df, male_df, nom_file)
    merged_df = transform_merge(original_df, merge_file)
    validate_merge(original_df, merged_df, merge_file)
    load(merged_df)
    return original_df, merged_df


if __name__ == '__main__':
    run(female_file, male_file, nom_file, merge_file)
