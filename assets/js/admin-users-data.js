/* Live data for admin-users.html — list/search/filter/paginate + suspend/reactivate + role change. */
(function(){
  "use strict";

  let status = "all";
  let search = "";
  let page = 1;
  const pageSize = 20;
  let searchTimer = null;
  let pendingAction = null; // { userId, patch, confirmed callback }

  function fmtDate(iso){
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function roleBadge(role){
    return role === "ADMIN" ? '<span class="badge-soft b-amber">Admin</span>' : '<span class="badge-soft b-violet">User</span>';
  }
  function statusBadge(isActive){
    return isActive ? '<span class="badge-soft b-teal">Active</span>' : '<span class="badge-soft b-gray">Inactive</span>';
  }

  function rowHtml(u, isSelf){
    const roleAction = u.role === "ADMIN"
      ? '<li><a class="dropdown-item" href="#" data-action="demote" data-id="' + u.id + '"><i class="bi bi-person me-2"></i>Make regular user</a></li>'
      : '<li><a class="dropdown-item" href="#" data-action="promote" data-id="' + u.id + '"><i class="bi bi-shield-fill me-2"></i>Make admin</a></li>';
    const statusAction = u.isActive
      ? '<li><a class="dropdown-item text-danger" href="#" data-action="suspend" data-id="' + u.id + '"' + (isSelf ? ' style="pointer-events:none;opacity:.4;" title="You can\'t suspend your own account"' : '') + '><i class="bi bi-slash-circle me-2"></i>Suspend</a></li>'
      : '<li><a class="dropdown-item text-success" href="#" data-action="reactivate" data-id="' + u.id + '"><i class="bi bi-check-circle me-2"></i>Reactivate</a></li>';
    return '' +
      '<tr>' +
        '<td><div class="d-flex align-items-center gap-2"><div class="avatar avatar-sm" style="background:var(--brand-100);">' + MET.esc(MET.initials(u.name)) + '</div>' + MET.esc(u.name) + (isSelf ? ' <span class="text-muted-c" style="font-size:.72rem;">(you)</span>' : '') + '</div></td>' +
        '<td>' + MET.esc(u.email) + '</td>' +
        '<td>' + (u.phone ? MET.esc(u.phone) : '<span class="text-muted-c">—</span>') + '</td>' +
        '<td>' + roleBadge(u.role) + '</td>' +
        '<td>' + fmtDate(u.createdAt) + '</td>' +
        '<td>' + statusBadge(u.isActive) + '</td>' +
        '<td class="text-end"><button class="icon-btn ghost ripple-surface" data-bs-toggle="dropdown"><i class="bi bi-three-dots-vertical"></i></button>' +
          '<ul class="dropdown-menu dropdown-menu-end">' + roleAction + statusAction + '</ul>' +
        '</td>' +
      '</tr>';
  }

  function renderStats(resp){
    document.getElementById("statTotalUsers").textContent = resp.totalUsers;
    document.getElementById("statActive").textContent = resp.activeUsers;
    document.getElementById("statInactive").textContent = resp.inactiveUsers;
  }

  function load(){
    document.getElementById("usersTableBody").innerHTML = '<tr><td colspan="7"><div class="section-loading" style="min-height:100px;"></div></td></tr>';
    $.when(
      MET.api.get("/admin/users" + MET.qs({ status: status, search: search || undefined, page: page, pageSize: pageSize })),
      MET.api.get("/admin/users" + MET.qs({ status: "admin", pageSize: 1 }))
    ).then(function(resp, adminResp){
      renderStats(resp);
      document.getElementById("statAdmins").textContent = adminResp.total;

      const selfId = MET.currentUser ? MET.currentUser.id : null;
      document.getElementById("usersTableBody").innerHTML = resp.items.length
        ? resp.items.map(function(u){ return rowHtml(u, u.id === selfId); }).join("")
        : '<tr><td colspan="7"><div class="empty-state py-4"><p>No users match this filter.</p></div></td></tr>';

      const start = resp.items.length ? (page - 1) * pageSize + 1 : 0;
      const end = (page - 1) * pageSize + resp.items.length;
      document.getElementById("usersShowingLine").textContent = "Showing " + start + "-" + end + " of " + resp.total + " users";
      document.getElementById("usersPrevPage").disabled = page <= 1;
      document.getElementById("usersNextPage").disabled = end >= resp.total;
    }, function(err){
      MET.toastError(err.message || "Couldn't load users.");
    });
  }

  function askConfirm(opts){
    document.getElementById("confirmActionTitle").textContent = opts.title;
    document.getElementById("confirmActionBody").textContent = opts.body;
    pendingAction = opts.onConfirm;
    new bootstrap.Modal(document.getElementById("confirmActionModal")).show();
  }

  $(document).on("click", "[data-action]", function(e){
    e.preventDefault();
    const id = $(this).data("id");
    const action = $(this).data("action");
    if(action === "suspend"){
      askConfirm({
        title: "Suspend this user?",
        body: "They'll be signed out everywhere and won't be able to log back in until reactivated.",
        onConfirm: function(){ return MET.api.patch("/admin/users/" + id, { isActive: false }); }
      });
    } else if(action === "reactivate"){
      MET.api.patch("/admin/users/" + id, { isActive: true }).then(function(){
        MET.toastSuccess("User reactivated.");
        load();
      }, function(err){ MET.toastError(err.message); });
    } else if(action === "promote"){
      askConfirm({
        title: "Make this user an admin?",
        body: "They'll get full access to the admin console, including managing other users.",
        onConfirm: function(){ return MET.api.patch("/admin/users/" + id, { role: "ADMIN" }); }
      });
    } else if(action === "demote"){
      askConfirm({
        title: "Remove admin access?",
        body: "They'll lose access to the admin console and become a regular user.",
        onConfirm: function(){ return MET.api.patch("/admin/users/" + id, { role: "USER" }); }
      });
    }
  });

  $("#confirmActionBtn").on("click", function(){
    if(!pendingAction) return;
    const $btn = $(this);
    MET.showButtonLoading($btn, "Please wait…");
    pendingAction().then(function(){
      MET.hideButtonLoading($btn);
      bootstrap.Modal.getInstance(document.getElementById("confirmActionModal")).hide();
      MET.toastSuccess("Done.");
      load();
    }, function(err){
      MET.hideButtonLoading($btn);
      bootstrap.Modal.getInstance(document.getElementById("confirmActionModal")).hide();
      MET.toastError(err.message);
    });
  });

  $("#statusFilter .filter-chip").on("click", function(){
    status = $(this).data("status");
    page = 1;
    load();
  });

  $("#userSearch").on("input", function(){
    const val = this.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function(){ search = val.trim(); page = 1; load(); }, 350);
  });

  $("#usersPrevPage").on("click", function(){ if(page > 1){ page--; load(); } });
  $("#usersNextPage").on("click", function(){ page++; load(); });

  // Wait for MET.currentUser to actually be populated (guardAuth resolves
  // asynchronously) so the "(you)" / can't-suspend-yourself logic in
  // rowHtml() is correct on the very first render, not just after a reload.
  $(document).on("met:user-ready", load);
})();
