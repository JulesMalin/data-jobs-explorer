"""Filter the NextGig 2026 job postings (CC-BY-4.0) to data and AI roles, and write two small tables for the browser."""
import duckdb

PATTERN = r"\b(data scien\w*|data analy\w*|data engineer\w*|machine learning|ml engineer\w*|ai engineer\w*|ai/ml|ai / ml|analytics engineer\w*|business intelligence|bi analyst|applied scien\w*|research scien\w*|llm|genai|generative ai|mlops)\b"
ROLE = """case
    when regexp_matches(t, '\\banalytics engineer') then 'Analytics Engineer'
    when regexp_matches(t, '\\b(ai engineer|ai/ml|ai / ml|llm|genai|generative ai)\\b') then 'AI Engineer'
    when regexp_matches(t, '\\b(machine learning|ml engineer|mlops)') then 'ML Engineer'
    when regexp_matches(t, '\\bdata engineer') then 'Data Engineer'
    when regexp_matches(t, '\\b(data scien|applied scien)') then 'Data Scientist'
    when regexp_matches(t, '\\bresearch scien') then 'Research Scientist'
    when regexp_matches(t, '\\b(business intelligence|bi analyst)') then 'BI Analyst'
    when regexp_matches(t, '\\bdata analy') then 'Data Analyst' end"""

con = duckdb.connect()
con.sql(f"""create table jobs as
select row_number() over () as job_id, {ROLE} as role,
  title, company_name as company, industry, job_level_normalized as seniority,
  try_cast(years_experience_numeric as double) as years_experience, lower(work_model) as work_model,
  case when country in ('USA','United States','US','United States of America') then 'United States' else country end as country, city,
  case when salary_currency='USD' and try_cast(salary_min as double) > 20000 then try_cast(salary_min as double) end as salary_min_usd,
  case when salary_currency='USD' and try_cast(salary_max as double) > 20000 then try_cast(salary_max as double) end as salary_max_usd,
  skills_required
from (select *, lower(coalesce(normalized_title, title)) t from 'data/raw.parquet')
where regexp_matches(t, '{PATTERN}')""")
con.sql("""create table job_skills as
select job_id, trim(lower(s)) as skill from (
  select job_id, unnest(try_cast(skills_required as varchar[])) as s from jobs where skills_required like '[%')
where s is not null and length(trim(s)) between 2 and 40""")
con.sql("alter table jobs drop column skills_required")
print(con.sql("select role, count(*) n from jobs group by 1 order by 2 desc").fetchall())
print("postings:", con.sql("select count(*) from jobs").fetchone()[0], "| skill rows:", con.sql("select count(*) from job_skills").fetchone()[0])
print("top skills:", con.sql("select skill, count(*) from job_skills group by 1 order by 2 desc limit 12").fetchall())
con.sql("delete from job_skills where job_id in (select job_id from jobs where role is null); delete from jobs where role is null; copy jobs to 'web/jobs.csv' (header)")
con.sql("copy job_skills to 'web/job_skills.csv' (header)")
