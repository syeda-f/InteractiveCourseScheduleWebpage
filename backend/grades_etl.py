import pandas as pd
from pathlib import Path

# Folder locations (relative to backend/grades_etl.py)
DATA_FOLDER = Path(__file__).resolve().parent / 'data'
OUTPUT_FOLDER = Path(__file__).resolve().parent / 'output'

MALE_FILE = DATA_FOLDER / '001 CCES Male 202510 per section.xlsx - Sheet2.csv'
FEMALE_FILE = DATA_FOLDER / '002 CCES Female 202510 per section.xlsx - Sheet2.csv'
COURSES_FILE = DATA_FOLDER / 'Grades_Merged_Male_Female - Sorted_Sections.csv'
MERGE_FILE = DATA_FOLDER / 'Cross_Listed_Codes.csv'

GRADES = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'P', 'D+', 'D&Below']
VISUALIZATION_GRADES = [grade for grade in GRADES if grade != 'P']
NUMERIC_COLUMNS = GRADES + ['total_students', 'passing_count', 'withdraw_count']

SECTION_COLUMNS = {
    0: 'department', 1: 'course_number', 2: 'section_number',
    3: 'course_title', 4: 'instructor', 5: 'total_students',
    6: 'A+', 8: 'A', 10: 'B+', 12: 'B', 14: 'C+', 16: 'C',
    18: 'P', 20: 'D+', 22: 'D&Below',
    24: 'passing_count', 26: 'withdraw_count',
}
COURSE_COLUMNS = {
    0: 'campus', 1: 'department', 2: 'course_number',
    3: 'course_title', 5: 'total_students', 7: 'A+', 9: 'A',
    13: 'B+', 15: 'B', 17: 'C+', 19: 'C', 21: 'P',
    23: 'D+', 25: 'D&Below', 29: 'passing_count',
    32: 'withdraw_count',
}


def extract(male_file=MALE_FILE, female_file=FEMALE_FILE, courses_file=COURSES_FILE):
    male_df = pd.read_csv(male_file, header=None, skiprows=3, dtype=str)
    female_df = pd.read_csv(female_file, header=None, skiprows=3, dtype=str)
    courses_df = pd.read_csv(courses_file, header=None, skiprows=3, dtype=str)
    return male_df, female_df, courses_df


def calculate_percentages(df):
    df = df.copy()
    df['grade_total'] = df[GRADES].sum(axis=1)
    df['visualization_grade_total'] = df[VISUALIZATION_GRADES].sum(axis=1)
    df['total_difference'] = df['total_students'] - df['grade_total']

    # Grade distribution percentages: P is excluded from the denominator.
    denominator = df['visualization_grade_total'].replace(0, float('nan'))
    enrollment = df['total_students'].replace(0, float('nan'))
    for grade in VISUALIZATION_GRADES:
        df[grade + '_pct'] = (df[grade] / denominator * 100).fillna(0).round(2)
        df[grade + '_enrollment_pct'] = (
            df[grade] / enrollment * 100
        ).fillna(0).round(2)

    df['passing_pct'] = (df['passing_count'] / enrollment * 100).fillna(0).round(2)
    df['withdraw_pct'] = (df['withdraw_count'] / enrollment * 100).fillna(0).round(2)
    return df


def clean_data(df):
    df = df.copy().dropna(how='all')
    df = df[df['department'].notna() & df['course_number'].notna()].copy()
    for column in df.select_dtypes(include='object').columns:
        df[column] = df[column].str.strip()

    df['department'] = df['department'].str.upper()
    df['course_number'] = df['course_number'].str.replace(r'\.0$', '', regex=True)
    if 'section_number' in df.columns:
        df['section_number'] = df['section_number'].str.replace(r'\.0$', '', regex=True)
    df['course_code'] = df['department'] + ' ' + df['course_number']
    df['original_course_code'] = df['course_code']
    df['term_code'] = '202510'
    df['campus'] = df['campus'].str.title()

    # Source reports sometimes leave the P count blank.
    df['P'] = df['P'].replace('', '0').fillna('0')
    for column in NUMERIC_COLUMNS:
        df[column] = pd.to_numeric(df[column], errors='raise')
    if df[NUMERIC_COLUMNS].isna().any().any():
        raise ValueError('Missing numeric counts in the input data')
    if (df[NUMERIC_COLUMNS] < 0).any().any():
        raise ValueError('Negative counts in the input data')
    if (df[NUMERIC_COLUMNS] % 1 != 0).any().any():
        raise ValueError('Non-integer counts in the input data')
    df[NUMERIC_COLUMNS] = df[NUMERIC_COLUMNS].astype(int)
    return calculate_percentages(df)


def transform_general(male_df, female_df, courses_df):
    male = male_df[list(SECTION_COLUMNS)].rename(columns=SECTION_COLUMNS).copy()
    female = female_df[list(SECTION_COLUMNS)].rename(columns=SECTION_COLUMNS).copy()
    male['campus'] = 'Male'
    female['campus'] = 'Female'
    sections = pd.concat([male, female], ignore_index=True)
    courses = courses_df[list(COURSE_COLUMNS)].rename(columns=COURSE_COLUMNS)
    return clean_data(sections), clean_data(courses)


def build_mapping(merge_file=MERGE_FILE):
    merge_df = pd.read_csv(merge_file, dtype=str).fillna('')
    mapping = {}
    for _, row in merge_df.iterrows():
        final_code = ' '.join(row['final_course_code'].upper().split())
        if not final_code:
            continue
        for column in ['COSC', 'SOEN', 'AINT', 'ITAP', 'CSEC', 'COEN']:
            original = ' '.join(row[column].upper().split())
            if not original:
                continue
            if original in mapping and mapping[original] != final_code:
                raise ValueError(f'Conflicting cross-list mapping: {original}')
            mapping[original] = final_code
    return mapping


def transform_merge(sections_df, courses_df, merge_file=MERGE_FILE):
    mapping = build_mapping(merge_file)

    # Sections are never collapsed: only their course codes are unified.
    sections_merged = sections_df.copy()
    sections_merged['course_code'] = (
        sections_merged['course_code'].map(mapping)
        .fillna(sections_merged['course_code'])
    )

    # Course rows with the same unified code are aggregated.
    courses = courses_df.copy()
    courses['course_code'] = courses['course_code'].map(mapping).fillna(courses['course_code'])
    aggregations = {column: 'sum' for column in NUMERIC_COLUMNS}
    aggregations['course_title'] = 'first'
    aggregations['original_course_code'] = lambda values: ', '.join(
        sorted(values.dropna().unique())
    )
    courses_merged = courses.groupby(
        ['term_code', 'course_code'], as_index=False
    ).agg(aggregations)
    courses_merged = calculate_percentages(courses_merged)
    return sections_merged, courses_merged


def load(sections_original, sections_merged, courses_original, courses_merged):
    # One CSV holds all four views. Filter by BOTH labels when reading it.
    datasets = []
    for record_type, merge_status, df in [
        ('section', 'original', sections_original),
        ('section', 'merged', sections_merged),
        ('course', 'original', courses_original),
        ('course', 'merged', courses_merged),
    ]:
        view = df.copy()
        view['record_type'] = record_type
        view['merge_status'] = merge_status
        datasets.append(view)

    final_df = pd.concat(datasets, ignore_index=True)
    OUTPUT_FOLDER.mkdir(parents=True, exist_ok=True)
    output_file = OUTPUT_FOLDER / 'grades_processed.csv'
    final_df.to_csv(output_file, index=False)
    return output_file


def run(male_file=MALE_FILE, female_file=FEMALE_FILE,
        courses_file=COURSES_FILE, merge_file=MERGE_FILE):
    male_df, female_df, courses_df = extract(male_file, female_file, courses_file)
    sections_original, courses_original = transform_general(male_df, female_df, courses_df)
    sections_merged, courses_merged = transform_merge(
        sections_original, courses_original, merge_file
    )

    assert len(sections_original) == len(sections_merged), 'Section count changed'
    for column in NUMERIC_COLUMNS:
        assert courses_original[column].sum() == courses_merged[column].sum(), (
            f'{column} total changed during merging'
        )

    output_file = load(sections_original, sections_merged, courses_original, courses_merged)
    print('Grade Distribution ETL completed successfully!')
    print('Original sections:', len(sections_original))
    print('Unified sections:', len(sections_merged))
    print('Original course records:', len(courses_original))
    print('Merged courses:', len(courses_merged))
    print('Output file:', output_file)
    print('Section records with grade-total differences:',
          (sections_original['total_difference'] != 0).sum())
    print('Course records with grade-total differences:',
          (courses_original['total_difference'] != 0).sum())
    return sections_original, sections_merged, courses_original, courses_merged


if __name__ == '__main__':
    run()
