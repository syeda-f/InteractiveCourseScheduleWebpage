
import pandas as pd

female_file = 'femalefall.csv'
male_file = 'malefall.csv'
nom_file = 'Nomenclature.csv'
merge_file = 'Cross_Listed_Codes.csv'

# Extraction function
def extract(female_file_name, male_file_name):
    female_df = pd.read_csv(female_file_name, header=1, dtype=str)
    male_df = pd.read_csv(male_file_name, dtype=str)
    return female_df, male_df

# Transformation functions
# General tranformations
def transform_general(female_df, male_df, nom_file_name):
    # get rid of empty rows
    female_df = female_df.dropna(how='all')
    male_df = male_df.dropna(how='all')

    # drop header row from male csv
    male_df = male_df[male_df['TERM CODE'] != 'TERM CODE']

    # merge male & female 
    df = pd.concat([female_df, male_df], axis=0, ignore_index=True)

    # standardize column names: convert to snake_case
    df.rename(columns={
        'TERM CODE': 'term_code',
        'CRN': 'crn',
        'CAMP CODE': 'camp_code',
        'COURSE CODE': 'course_code',
        'SEQUENCE NUMBER': 'sequence_number',
        'COURSE Title': 'course_title',
        'MAX_ENRL': 'max_enrl',
        'ENRL': 'enrl',
        'AVAIL': 'avail',
        'SESSION_CODE': 'session_code',
        'ATIMING': 'atiming',
        'SAT': 'sat', 'SUN': 'sun', 'MON': 'mon', 'TUE': 'tue', 'WED': 'wed', 'THU': 'thu',
        'ROOM': 'room',
        'Instructor': 'instructor'},
        inplace=True)

    # trim leading and trainling whitespace to avoid errors in string matching
    df = df.apply(lambda x: x.str.strip() if x.dtype == "object" else x)

    # replace 'NAME NOT FOUND FOR PIDM:' with 'Unassigned' for instructor column
    df['instructor'] = df['instructor'].replace('NAME NOT FOUND FOR PIDM:', 'Unassigned')

    # standardize instructor names: convert to Title Case
    df['instructor'] = df['instructor'].str.title()

    # Remove rows with course_title: 'Intermediate Enhanced Learning', 'Advance Enhanced Learning', 'Advance Exit Exam' [no room & no timing]
    df.drop(df[df['course_title'].isin(['Intermediate Enhanced Learning', 'Advance Enhanced Learning', 'Advance Exit Exam'])].index, inplace=True)

    # convert max_enrl, enrl, avail to int data type
    df['max_enrl'] = pd.to_numeric(df['max_enrl'], errors='coerce').fillna(0).astype('int32')
    df['enrl'] = pd.to_numeric(df['enrl'], errors='coerce').fillna(0).astype('int32')
    df['avail'] = pd.to_numeric(df['avail'], errors='coerce').fillna(0).astype('int32') 

    # convert weekly_contact_hr to float
    df['weekly_contact_hr'] = pd.to_numeric(df['weekly_contact_hr'], errors='coerce').fillna(0.0).astype('float')

    # Fix nomenclature by comparing course_title to Nomenclature.xlsx only for CCES courses
    nom_df = pd.read_csv(nom_file_name)
    df = pd.merge(df, nom_df[['course_code', 'original_course_title', 'unified_course_title']], 
                  how = 'left', 
                  left_on = ['course_code', 'course_title'],
                  right_on = ['course_code', 'original_course_title'])
    
    df['course_title'] = df['unified_course_title'].combine_first(df['course_title'])
    df.drop(columns=['unified_course_title', 'original_course_title'], inplace=True)
    
    return df

def transform_merge(df, merge_file_name):
    # Merge cross-listed & unify cross_listed codes
    # if term_code, camp_code, sequence_number, course_title, timing, sat, sun, mon, tue, wed, thu, room, instructor
    merge_df = pd.read_csv(merge_file_name)
    df = df.groupby(
        ['term_code', 'camp_code', 'sequence_number', 'course_title', 'atiming', 'sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'room', 'instructor'], as_index=False, dropna=False
    ).agg({
            'max_enrl':'sum', 
            'enrl': 'sum',
            'avail': 'sum',
            'course_code': 'first',
            'crn': 'first',
            'session_code': 'first',
            'weekly_contact_hr': 'first'
    })
    df = pd.merge(df, merge_df[['course_title', 'final_course_code']], how='left', on='course_title')
    df['course_code'] = df['final_course_code'].combine_first(df['course_code'])
    df.drop(columns=['final_course_code'], inplace=True)

    # reordering columns
    df = df[[
        'term_code', 'crn', 'camp_code', 'course_code', 'sequence_number', 'course_title', 
        'max_enrl', 'enrl', 'avail', 'session_code', 'atiming', 'sat', 'sun', 'mon', 'tue', 
        'wed', 'thu', 'room', 'instructor', 'weekly_contact_hr'
        ]]

    return df

# Load function
def load(df):
    df.to_csv('merged_fall.csv', index=False)

# Run the ETL process
def run(female_file, male_file, nom_file, merge_file):

    #extract
    female_df, male_df = extract(
        female_file,
        male_file
    )

    #clean
    original_df = transform_general(
        female_df,
        male_df,
        nom_file
    )

    #merge cross-listed 
    merged_df = transform_merge(
        original_df.copy(),
        merge_file
    )

    return original_df, merged_df

if __name__ == "__main__":
    run()