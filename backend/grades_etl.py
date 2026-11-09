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


def clean_data(df, term_code="202510"):
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
    df['term_code'] = term_code
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


def transform_general(male_df, female_df, courses_df, term_code="202510"):
    male = male_df[list(SECTION_COLUMNS)].rename(columns=SECTION_COLUMNS).copy()
    female = female_df[list(SECTION_COLUMNS)].rename(columns=SECTION_COLUMNS).copy()
    male['campus'] = 'Male'
    female['campus'] = 'Female'
    sections = pd.concat([male, female], ignore_index=True)
    courses = courses_df[list(COURSE_COLUMNS)].rename(columns=COURSE_COLUMNS)
    return clean_data(sections, term_code), clean_data(courses, term_code)


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


def load(sections_original, sections_merged, courses_original, courses_merged, term_code="202510"):
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
    (OUTPUT_FOLDER / 'grades').mkdir(parents=True, exist_ok=True)
    output_file = OUTPUT_FOLDER / 'grades' / f'grades_{term_code}.csv'
    final_df.to_csv(output_file, index=False)
    return output_file


def run(male_file=MALE_FILE, female_file=FEMALE_FILE,
        courses_file=COURSES_FILE, merge_file=MERGE_FILE, term_code="202510"):
    if not (term_code.isdigit() and len(term_code) == 6):
        raise ValueError("Semester code must be exactly six digits")
    male_df, female_df, courses_df = extract(male_file, female_file, courses_file)
    sections_original, courses_original = transform_general(male_df, female_df, courses_df, term_code)
    sections_merged, courses_merged = transform_merge(
        sections_original, courses_original, merge_file
    )

    assert len(sections_original) == len(sections_merged), 'Section count changed'
    for column in NUMERIC_COLUMNS:
        assert courses_original[column].sum() == courses_merged[column].sum(), (
            f'{column} total changed during merging'
        )

    output_file = load(sections_original, sections_merged, courses_original, courses_merged, term_code)
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


# Independent imports: store each source separately, then rebuild the existing
# grades_<term>.csv format consumed by /api/grades.
SOURCE_NAMES = ('male', 'female', 'combined_sections', 'courses')


def parse_grade_source(path, source, term_code):
    """Parse one raw report. Combined sections must identify each row's campus."""
    if source not in SOURCE_NAMES:
        raise ValueError(f'Unknown grade source: {source}')
    # Reports can contain a variable number of title/header rows, including
    # repeated headings partway through the file. Read all rows first.
    raw = pd.read_csv(path, header=None, dtype=str).dropna(how='all')
    if raw.empty:
        raise ValueError(f'{source}: no grade rows found')

    count_col = 6 if source == 'combined_sections' else 5
    if raw.shape[1] <= count_col:
        raise ValueError(f'{source}: expected a student-count column at index {count_col}')

    # Only remove unmistakable report/header rows. Never silently discard a
    # malformed student-count value from an otherwise valid-looking data row.
    normalized = raw.fillna('').astype(str).apply(lambda col: col.str.strip().str.lower())
    header_terms = ('instructor name', 'course number', 'section number',
                    'total students', 'department', 'course title',
                    'student count', 'course code')
    is_header = normalized.apply(
        lambda col: col.isin(header_terms), axis=0
    ).any(axis=1)
    numeric_counts = pd.to_numeric(
        raw.iloc[:, count_col].astype(str).str.strip().str.replace(',', '', regex=False),
        errors='coerce',
    )
    data_candidates = raw.index[numeric_counts.notna() & ~is_header]
    if len(data_candidates) == 0:
        raise ValueError(f'{source}: no grade data rows found; check CSV layout')
    raw = raw.loc[data_candidates[0]:]
    raw = raw.loc[~is_header.loc[raw.index]].reset_index(drop=True)
    if raw.empty:
        raise ValueError(f'{source}: no grade rows found after removing headers')
    if source == 'courses':
        df = raw[list(COURSE_COLUMNS)].rename(columns=COURSE_COLUMNS).copy()
    else:
        if source == 'combined_sections':
            # Supported combined layout: campus as first column, followed by
            # the same 27-column section report layout used for male/female.
            first = raw.iloc[:, 0].fillna('').str.strip().str.title()
            if not first.isin(['Male', 'Female']).all():
                raise ValueError('Combined Sections CSV must have Male/Female campus in the first column of each data row, followed by the usual section columns')
            df = raw[[i + 1 for i in SECTION_COLUMNS]].copy()
            df.columns = list(SECTION_COLUMNS.values())
            df['campus'] = first.to_numpy()
        else:
            df = raw[list(SECTION_COLUMNS)].rename(columns=SECTION_COLUMNS).copy()
            df['campus'] = source.title()
    result = clean_data(df, term_code)
    if result.empty:
        raise ValueError(f'{source}: no valid grade rows found')
    if source == 'courses' and not result['campus'].isin(['Male', 'Female']).all():
        raise ValueError('Courses CSV must identify Male/Female campus for every row')
    return result


def rebuild_grade_views(sources, merge_file, term_code):
    """Return the four existing API views, with no duplicate section records."""
    # Prefer campus-specific sections over combined sections for that campus.
    sections = []
    combined = sources.get('combined_sections')
    for campus, name in [('Male', 'male'), ('Female', 'female')]:
        if name in sources:
            sections.append(sources[name])
        elif combined is not None:
            sections.append(combined.loc[combined['campus'].eq(campus)].copy())
    section_original = pd.concat(sections, ignore_index=True) if sections else None
    course_original = sources.get('courses')
    if section_original is None and course_original is None:
        raise ValueError('At least one grade dataset must be present')
    mapping = build_mapping(merge_file)
    section_merged = None
    if section_original is not None:
        section_merged = section_original.copy()
        section_merged['course_code'] = section_merged['course_code'].map(mapping).fillna(section_merged['course_code'])
    course_merged = None
    if course_original is not None:
        course = course_original.copy()
        course['course_code'] = course['course_code'].map(mapping).fillna(course['course_code'])
        aggregations = {col: 'sum' for col in NUMERIC_COLUMNS}
        aggregations['course_title'] = 'first'
        aggregations['original_course_code'] = lambda values: ', '.join(sorted(values.dropna().unique()))
        course_merged = calculate_percentages(course.groupby(['term_code', 'course_code'], as_index=False).agg(aggregations))
    views = []
    for record_type, original, merged in [('section', section_original, section_merged), ('course', course_original, course_merged)]:
        for status, df in [('original', original), ('merged', merged)]:
            if df is not None:
                view = df.copy()
                view['record_type'] = record_type
                view['merge_status'] = status
                views.append(view)
    return pd.concat(views, ignore_index=True), {
        'original_sections': 0 if section_original is None else len(section_original),
        'merged_sections': 0 if section_merged is None else len(section_merged),
        'original_courses': 0 if course_original is None else len(course_original),
        'merged_courses': 0 if course_merged is None else len(course_merged),
    }
