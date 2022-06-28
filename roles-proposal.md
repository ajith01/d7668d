# Part 3

### What database changes would be required to the starter code to allow for different roles for authors of a blog post? Imagine that we’d want to also be able to add custom roles and change the permission sets for certain roles on the fly without any code changes.

<br />
<br />

#### There are many ways to go about making this change. The least intrusive way would be to create another database model for `Roles`, which will have `roles_id (pk)`, `role_name`, and `permission` as fields. The `UserPost` model must be changed to include the `roles_id` as a foreign key. This way the role of the user for this particular post can be determined by querying the `UserPost` table with the `post_id` to determine the `role_id` which can be used to query the `Roles` table for the permissions.

<br />
<br />

### How would you have to change the PATCH route given your answer above to handle roles?

<br />
<br />

#### The changes I would make to the PATCH route above to use the database model given above is that I would query records from the `UserPost` table where `post_id` matches the id given in the API parameters and `user_id` matches the id of the logged-in user. If a record is returned, I will use the `role_id` from the record to query the `Roles` table to determine if the user is allowed to update the post. If they do not have permission to update the posts I will send an error message stating they do not have permission to make changes. If they do have permission, the rest of the code will be very similar. Updating the `authorIds` would be changed to give the users a `role_id` as this field is not present in the `UserPost` table.
