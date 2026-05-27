**WC Inception**

[WC Inception Files](file:///Users/ibarker/Documents/BMI%20Docs/WC%20Inception)  

**WCI Meetings**

  

  

**Production tickets**

-   
    

**Reporting:**

- EDI
- WCPRISM
- Verisk sends claims to CMS, relates to Medicare

  

  

**Questions:**

- Does “Injury During Employment” change anything in claim or downstream
- Can you open a death cost category if Death isn’t marked

  

  

**WC Notes**

- In 4 monopoly states, we will offer stop gap coverage 
- There will be some deductibles, states can differ on this
- Line level “Each Accident” limit at least seems to not be in the product model right nowg

- What do we need to do to ingest this?

  

**To Do** 

- Schedule shadowing with Saurav / Allwyn
- Schedule 1 meeting with Glenna to show us the WC parameters details
- Talk with Terri about inception meetings for CA to see what we can glean from that
- Get PM downloaded on all of our machines

  

  

**WC Meeting with Glenna**

- WC Parameters

- Benefit parameters

- No way to automate the data?
- Must have each year, previous years need to exist for old claims
- Only for Indemnity

- PPD Min / Max

- Not really used, doesn’t give us enough info since it can’t take into account rates per body part lost

- PPD Weeks not used
- Compensability Parameters 

- Dates might say they are expired, but this data is still used today and will only be updated if needed
- Some of this data gets pulled into the indemnity benefits screen where the adjuster can view it

  

  

**Process:**

- Do some WC shadowing with Glenna’s team
- Look into the PC PM and the review what changes are needed in CC UI
- Review CA initial backlog and see what is common and should be brought into this project

  

  

**Lessons learned:**

- Identify coverage categories (such as line/vehicle in CA) at inception
- Split testing out to a more granular level; don’t include reserve/exposure rules in coverage testing. Possibly remove other things
- Complete regular DBCC checks
- Keep a clearer line of communication with PC implementation team to understand where they are at with different coverages/states, and other changes.
- BA’s to lead by 1-2 sprints

  

**Timeline**

1. **Kickoff meeting 2/3**

2. **Workshops to be conducted all of February**

3. **First 2 weeks of March, estimate backlog by team** 
4. **Second 2 weeks of March, vet the plan with management**
5. **April is Sprint 0, setting up our dev environment and piping it with other integrations**
6. **1-2 Sprints, holding for PC PM to get setup.**
7. **June, begin development for WC.**

  

**Action Items**

- Robin to setup weekly meeting to continue tracking WC progress
- Setup initial meetings with WC SME’s.
- Reach out to UW to see if there’s a feeling of how much our coverage model is changing, how many total coverages we expect to have, how many State specific changes are there.

  

  

**Workers’ compensation notes**

  

**Shadowing Notes:**

- Lost time from work = No Indemnity tab
- Class Code is not automated **Could be something to update**
- Documents are very state specific and will take time to test
- Integrated to CMS (Medicare). They send us back 2 numbers, we send them many details
- HiMarley
- EDI / Mitchell

  

  

**Questions:**

How do we pay against these coverages?

|   |
|---|
|Workers' Comp Employer's Liability Medical|
|Workers' Comp Employer's Liability Indemnity|
|Other States Insurance - Med Only|
|Other States Insurance - Other than Med|

  

  

**IN PC:** “The Workers’ Compensation extension pack splits coverages into three screens: **Line-level Coverages**, **State-Specific**

**Information** and **Covered Employees**. This section describes the features of the Line-level Coverages screen.” **In CC prod, only “General” and “Locations”. Claim # 0368292**

  

  

- WC does allow multi-state policies
- **Classes** of employees are covered at locations, rather than having a complete list of employees who are covered.
- workers’ compensation insurance functions at various points in a policy lifecycle as disability insurance, health insurance, and life insurance.”

  

  

**AC2 UI:** 

368223 | 387177  
Basically there are questions about the ministry, how much payroll there is and what activities occur within the workplace. Then you select 1 liability limit. Then you can select a few form which seem to just modify who is covered.

  

  

  

  

  

Multi State is allowed, but it seems liability limit is policy level, not state level:

  

  

Example of the submission wizard steps for a new WC policy in PC: