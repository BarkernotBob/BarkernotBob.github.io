---
updated: 2025-07-24T20:50:56.183-04:00
edited_seconds: 324
---
# Makala's update 2/17/26
Hi team,

I wanted to share an update following our meeting with the iSolved team today. It sounds like we will be able to use a location code from the iSolved file to capture location information. We have requested a POC so we can see exactly what we’ll be working with.

On the AC side, there will be some work required since the location code will be added to the current file. We will likely need to make the location code field an optional field in AC so that we don't need to coordinate our changes with theirs. Additionally, we will need AC to be able to delineate which PAS system is the source.

Once we receive the POC from iSolved, I will set up time for the necessary people to review it together so we can begin the AC work.
# Updated Notes for PC
* If there is a sister company with 2 location #’s, will this break AC2 functionality? 
* If there is a location with 2 sister companies, will this break AC2 functionality?
# Paygo Overview from Caleb
1. Client signs agreement for Paygo
2. At least 30 day lead time (45 communicated) to them
3. We need WC code on each employee. We may help with this at the front end, but we also help teach them how to do this.
	1. Some jobs can have default codes assigned to them

# File Upload Process:
* Isolved/Evolution create a daily file
    * We manually go and retrieve this file
    * Upload the file to the storage-ac server
        * Finder - Command K
        * smb://storage-ac/ac-prd$
        * Jesse V if you need access
    * Upload the daily report within AC2

# Testing Process
## Query in Dbeaver
### How to initiate a connection to the database
1. Open the IBMDB2 connection, listed under **S102921C 2**. 
    1. HOST: bmicdev.brotherhoodmutual.com
    2. Database/Schema: S102921C
2. Use the following query:
---
SELECT *
FROM STGSQL.wcpgobat
WHERE MINISTRY_WORKS_POLICY_NUMBER LIKE '%280810%'
ORDER BY Process_Date DESC;

    Switch out "STG" with a value below if you need to query a different database
    Change the # within the %% symbols to query a different policy

DV2 - dev
UA2 - QA
UTE - UA
STG - Stage
SIT - SIT

---
### Understanding the data
* The database stores values for every uniquely billed entity on a policy. So if a policy had a TN and an IN location, each of these would have separate entries. This is because a unique entry is the combination of a policy #, WC code, and state. 
    * If an insured has multiple sister companies which have the same state and WC code, these need to be summed together. There is a separate database that stores all sister company data, and the values for these sister companies will be summed together before the final sum value is sent to the DB2 table.
    * in **Evolution**, eligible wages are often split into multiple entries. MinistryWorks has a complex calculation that tells you which ED codes apply as wages in which state. When a file is uploaded, all eligible payroll wages for each unique entity will be summed together and only the final sum will be stored in the DB2 table.
    * In **Isolved**, eligible wages for each entity always come through in just one row. This simplifies things tremendously, and greatly minimizes the size of the file each day. 
    * **Isolved** also introduces **Pay Group** which splits out data for pay periods such as Bi-Weekly, Monthly, etc. Pay groups function exactly like Sister companies mentioned above, where they are stored in a separate table and all eligible rows are summed together before the final sum is stored in the DB2 table.
    * Whenever you submit payroll data, all final sum values will be returned in the DB2 table even if no new values have been added for them. Essentially, if your file only contained an entry for Indiana wages but there were previous wages for Tennessee, when you query the DB2 table you'll see a new entry for both Indiana and Tennessee, but the TN value will just be a duplication of the last value with an updated date.
    * The **Process Date** column always displays the date 1 day before the date actually shown on the file uploaded.


## Error Checking in Paygo File

* You cannot process 2 duplicate rows on the same eligible record[^1] 
    * If the rows are exact duplicates within the **same file** INCLUDING the policy YTD values being the same, they will process fine because the logic knows it can take either record since the $ amounts are the same. 
    * If the records are duplicates with different policy YTD values but are not in the same file, then the newest records will simply overwrite the oldest record

[^1]: An eligible record is one that is written to the database. So this means it is for the same Policy #, State, Sister Company, WC Code, and Pay Group.